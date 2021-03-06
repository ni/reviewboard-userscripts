// ==UserScript==
// @name         More Awesome NI Review Board
// @version      1.18.1
// @namespace    https://www.ni.com
// @author       Alejandro Barreto (National Instruments)
// @license      MIT
// @homepageURL  https://github.com/ni/reviewboard-userscripts
// @supportURL   https://github.com/ni/reviewboard-userscripts/blob/master/docs/SUPPORT.md
// @updateURL    https://rebrand.ly/update-ni-reviewboard-user-js
// @include      https://review-board.natinst.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@9.13.1/dist/sweetalert2.all.min.js#sha384-8oDwN6wixJL8kVeuALUvK2VlyyQlpEEN5lg6bG26x2lvYQ1HWAV0k8e2OwiWIX8X
// @require      https://gist.githubusercontent.com/alejandro5042/af2ee5b0ad92b271cd2c71615a05da2c/raw/67b7203dfbc48f08ebddfc8327c92b2df28a3c4c/easy-userscripts.js?v=72#sha384-OgOM7UvZHxtPUmZoGbYhsgkLPuRj9SFTpO+LqbnaBzLDQaXmYlosSywfsljzjhCI
// ==/UserScript==

/* global eus, swal */

(function () {
  eus.globalSession.onFirst(document, 'body', async () => {
    eus.registerCssClassConfig(document.body, 'Select theme', 'theme', 'ni-light', {
      'ni-dark': 'Dark',
      'ni-middle': 'Middle',
      'ni-light': 'Light',
    });

    eus.registerCssClassConfig(document.body, 'Select review width', 'width', 'ni-width-readable', {
      'ni-width-readable': 'Optimize for readability',
      'ni-width-wide': 'Full width (original)',
    });

    eus.registerCssClassConfig(document.body, 'Select review order', 'feedOrder', 'ni-feed-oldest-first', {
      'ni-feed-newest-first': 'Newest first (AzDO)',
      'ni-feed-oldest-first': 'Oldest first (original)',
    });

    eus.registerCssClassConfig(document.body, 'Select wide diff behavior', 'wideDiffBehavior', 'ni-diff-scrollbars', {
      'ni-diff-scrollbars': 'Add scrollbars',
      'ni-diff-wordwrap': 'Word wrap',
      'ni-diff-original': 'Original behavior',
    });

    eus.registerCssClassConfig(document.body, 'Select timestamp format', 'timestampFormat', 'ni-show-smart-times', {
      'ni-show-original-times': 'Show only relative times (original)',
      'ni-show-absolute-times': 'Also show absolute times',
      'ni-show-smart-times': 'Intelligently display times',
    });

    // Replace plain gravatar defaults with a more useful icon.
    eus.globalSession.onEveryNew(document, 'img', img => {
      // eslint-disable-next-line no-param-reassign
      img.src = img.src.replace('d=mm', 'd=retro');
    });

    // Collapse the navbar into a single line.
    eus.globalSession.onEveryNew(document, '#navbar', navbar => {
      eus.insertAfter(navbar, document.getElementById('nav_toggle'));
    });

    // Let you click anywhere in the header to expand/collapse a comment.
    eus.globalSession.on(document, '#reviews .header', 'click', (event, header) => {
      const clickedOnButton = event.target.closest('.collapse-button');
      if (clickedOnButton) return;
      header.querySelector('.collapse-button').click();
    });

    // Show file regex patterns for default reviewers in groups list.
    if (window.location.href.includes('/account/preferences/')) {
      // Collect the default reviewers into a list, and cache the result so we can enhance the group items as they come in and out of the DOM during search.
      const defaultReviewers = [];
      for await (const defaultReviewer of getReviewBoardDefaultReviewers()) {
        defaultReviewers.push(defaultReviewer);
      }

      // Enhance groups with their file regex patterns.
      eus.globalSession.onEveryNew(document, 'div.groups li', groupItem => {
        for (const defaultReviewer of defaultReviewers) {
          const link = groupItem.querySelector('a[href*="/groups/"]');
          const name = link.href.match(/\/groups\/(.+)\//i)[1];
          for (const group of defaultReviewer.groups) {
            if (group.title === name) {
              const description = link.parentNode.nextSibling;
              const repo = defaultReviewer.repositories.map(r => r.title).join(' ');
              description.insertAdjacentHTML('beforeEnd', `<div class="default-reviewer-info"><b>${defaultReviewer.name}${repo ? ` [${repo}]` : ''}:</b>  ${defaultReviewer.file_regex}</div>`);
              break;
            }
          }
        }
      });
    }

    const reviewIdMatch = window.location.href.match(/\/r\/([0-9]*)\//i);
    if (reviewIdMatch) {
      const requestId = reviewIdMatch[1];

      // Add an icon to the complete file from its diff.
      if (window.location.href.includes('/diff/')) {
        eus.globalSession.onEveryNew(document, '#diffs tr.filename-row th', fileNameRow => {
          const server = document.getElementById('field_repository').innerText;
          const path = fileNameRow.innerText;

          const link = document.createElement('a');
          link.href = `https://p4.natinst.com/browser/${server}/${path.trim().substring(2)}`;
          link.target = '_blank';
          link.innerText = '📄';
          link.onclick = event => event.stopPropagation();
          fileNameRow.append(link);
        });
      }

      // Annotate times with their absolute time.
      eus.globalSession.onEveryNew(document, 'time.timesince', timeElement => {
        if (eus.seen(timeElement)) return;
        const timestamp = Date.parse(timeElement.innerText.replace('.', ''));
        const daysSince = (Date.now() - timestamp) / (1000 * 3600 * 24 * 1.0);
        const extraCssClass = daysSince >= 7 ? 'old-enough-timestamp' : '';
        const [date, year, time] = timeElement.innerText.split(',', 3);
        timeElement.insertAdjacentHTML('beforeBegin', `<span class='timestamp-absolute ${extraCssClass}'><span class="date">${date}, ${year}</span> <span class="time">${time}</span> &mdash; </span> `);
      });

      // Annotate approval details on users and groups.
      eus.globalSession.onFirst(document, '#fieldset_reviewers_body', async (targetPeopleAndGroups) => {
        const groupsField = document.getElementById('field_target_groups');
        const peopleField = document.getElementById('field_target_people');

        // The edit button copies the field element HTML text into a text box. Well, if we are modifying it, it'll be wrong when it gets copied into the text box. So let's reset it.
        const originalGroupsHtml = groupsField.innerHTML;
        const originalPeopleHtml = peopleField.innerHTML;
        eus.globalSession.onEveryNew(targetPeopleAndGroups, 'a.editicon', link => {
          link.addEventListener('click', () => {
            if (eus.addedClass(targetPeopleAndGroups, 'original-look')) {
              groupsField.innerHTML = originalGroupsHtml;
              peopleField.innerHTML = originalPeopleHtml;
            }
          }, true); // capture=true to be the first to handle the click.
        });

        // Tell the user to refresh once they've begun editing users or groups.
        peopleField.insertAdjacentHTML('afterEnd', '<div class="refresh-page-notice">Refresh the page to re-annotate status.</div>');

        // Remove commas between names.
        removeImmediateInnerText(groupsField);
        removeImmediateInnerText(peopleField);

        // Reword the label for "People" since we removed the "Reviewers" header.
        document.querySelector('label[for=field_target_people]').innerText = 'Reviewers:';

        // Add users that are listed on the review. Note: We may add more people in the next loop that aren't listed currently who left feedback previously but are currently removed.

        function createUserVotingRecord(username) {
          return {
            username,
            span: document.createElement('span'),
            vote: '',
            details: '',
          };
        }

        const reviewRequest = await getReviewBoardRequest(requestId);
        const users = {};
        for (const user of reviewRequest.target_people) {
          const username = user.title;
          users[username] = createUserVotingRecord(username);
        }

        // Go through each user and record their approval.
        let prebuildThreads = [];
        for await (const review of getReviewBoardReviews(requestId)) {
          if (!review.public) continue;

          const username = review.links.user.title;
          // eslint-disable-next-line no-multi-assign
          const user = users[username] = users[username] || createUserVotingRecord(username);

          const thread = document.querySelector(`.review[data-review-id="${review.id}"]`);
          let threadClass;
          let threadLabel;
          let threadSubtitle;

          const comment = review.body_top;
          let match;

          if (username === 'prebuild') {
            // Record the vote of a build user.

            if (comment.match(/going to check/)) {
              user.vote = '🔨';
              user.details = '';
              for (const prebuildThread of prebuildThreads) {
                prebuildThread.classList.add('old');
              }
              prebuildThreads = [];
            // eslint-disable-next-line no-cond-assign
            } else if (match = comment.match(/successfully built the changes on ([\w-_]*)/i)) {
              const platform = match[1];
              user.vote = '';
              user.details += `<br> ⤷ ${platform} ✅`;
              threadLabel = '<label class="ship-it-label">Pass</label>';
              threadSubtitle = platform;
            // eslint-disable-next-line no-cond-assign
            } else if (match = comment.match(/^Build failed on ([\w-_]*)/i)) {
              const platform = match[1];
              user.vote = '';
              user.details += `<br> ⤷ ${platform} ❌`;
              threadLabel = '<label class="fix-it-label">Fail</label>';
              threadSubtitle = platform;
            } else if (comment.match(/fail/i)) {
              user.vote = '';
              user.details += '<br> ⤷ ❌';
              threadLabel = '<label class="fix-it-label">Fail</label>';
            } else {
              user.vote = '';
              user.details += '<br> ⤷ ❓';
            }

            if (thread) { // There are no threads on the diff review page.
              prebuildThreads.push(thread);
            }
          } else {
            // Record the vote of a non-build user.

            // eslint-disable-next-line no-lonely-if, no-cond-assign
            if (match = comment.match(/^Declining\s+([\w-_]+)\b/i)) {
              const declinedUser = users[match[1]];
              if (declinedUser) declinedUser.vote = '✖️';
              threadClass = 'user-action';
            // eslint-disable-next-line no-cond-assign
            } else if (match = comment.match(/^Resetting\s+([\w-_]+)\b/i)) {
              const resetUser = users[match[1]];
              if (resetUser) resetUser.vote = '';
              threadClass = 'user-action';
            } else {
              user.vote = review.ship_it ? '✅' : '💬';
            }
          }

          // Annotate the review on the HTML page
          if (thread) { // There are no threads on the diff review page.
            thread.classList.add(`users-${eus.toCss(username)}`);
            if (threadClass) thread.classList.add(threadClass);
            if (threadLabel) thread.querySelector('.labels-container').insertAdjacentHTML('beforeend', threadLabel);
            if (threadSubtitle) thread.querySelector('.header a.user').insertAdjacentHTML('beforeend', ` &mdash; ${threadSubtitle}`);
          }
        }

        // Populate the span that has each user's name and vote.
        for (const user of Object.values(users)) {
          user.span.classList.add('user-status');
          if (user.vote === '✖️') {
            user.span.classList.add('declined');
            user.span.innerHTML += `${user.username}${user.details}`;
          } else {
            user.span.innerHTML += [user.username, user.vote, user.details].filter(Boolean).join(' ');
          }
        }

        // Annotates the `.niconfig` owner review block with approvals.
        const owners = document.querySelector('#field_beanbag_notefield_notes > p:last-child');
        if (owners && owners.innerText.includes('.niconfig Owners')) {
          owners.innerHTML = Object.values(users).reduce((html, user) => html.replace(new RegExp(`\\b${user.username}\\b`, 'ig'), user.span.outerHTML), owners.innerHTML);
          owners.classList.add('owner-info');
        }

        // Annotate users on the right.
        for (const user of Object.values(users)) {
          const link = peopleField.querySelector(`a[href*="${user.username}"]`);
          if (link) { // Could not exist if the user was removed from the review.
            link.innerText = '';
            link.appendChild(user.span);
            if (user.username !== 'prebuild') {
              if (user.vote !== '✖️') {
                link.insertAdjacentHTML('afterBegin', `<button class="user-action decline" data-username="${user.username}" title="Decline reviewer">🗙</button>`);
              }
              link.insertAdjacentHTML('afterBegin', `<button class="user-action reset" data-username="${user.username}" title="Reset reviewer">⭮</button>`);
            }
          }
        }

        // Handle clicks to reviewer decline buttons.
        eus.globalSession.on(targetPeopleAndGroups, '.user-action.decline', 'click', (event, button) => {
          event.preventDefault();

          const { username } = button.dataset;
          const defaultReason = 'Not needed for these changes.';
          swal.fire({
            input: 'text',
            title: `Declining ${username}`,
            text: 'They will be crossed out in the list but will still receive emails. Optional decline reason:',
            inputPlaceholder: defaultReason,
            confirmButtonText: 'Decline',
            confirmButtonColor: '#e40',
            showCancelButton: true,
            showLoaderOnConfirm: true,
            preConfirm: async reason => {
              await postReview(requestId, `Declining ${username}: ${reason || defaultReason}`);
              // eslint-disable-next-line no-restricted-globals
              location.reload();
              await eus.sleep(100000); // Reload isn't blocking, so let's sleep while we wait for the page to reload.
            },
          });
        });

        // Handle clicks to reviewer reset buttons.
        eus.globalSession.on(targetPeopleAndGroups, '.user-action.reset', 'click', (event, button) => {
          event.preventDefault();

          const { username } = button.dataset;
          const defaultReason = 'Please review these changes again.';
          swal.fire({
            input: 'text',
            title: `Resetting ${username}`,
            text: 'Their status will be reset and they will receive an email. Optional reset reason:',
            inputPlaceholder: defaultReason,
            confirmButtonText: 'Reset',
            confirmButtonColor: '#e40',
            showCancelButton: true,
            showLoaderOnConfirm: true,
            preConfirm: async reason => {
              await postReview(requestId, `Resetting ${username}: ${reason || defaultReason}`);
              // eslint-disable-next-line no-restricted-globals
              location.reload();
              await eus.sleep(100000); // Reload isn't blocking, so let's sleep while we wait for the page to reload.
            },
          });
        });

        // Annotate groups on the right.
        for (const group of reviewRequest.target_groups) {
          // Fetch each group in parallel.
          fetch(`${group.href}/users/`)
            .then(response => response.json())
            .then(groupMembers => {
              const groupUrl = `/groups/${group.title}/`;
              const link = groupsField.querySelector(`a[href="${groupUrl}"]`);
              for (const groupMember of groupMembers.users) {
                const user = users[groupMember.username];
                if (user) link.insertAdjacentHTML('beforeend', `<br>⤷ ${user.span.outerHTML}`);
              }
            });
        }
      });
    }
  });

  // Dashboard sorting.
  eus.onUrl(/\/dashboard\//gi, (session, urlMatch) => {
    session.onFirst(document, '.datagrid-body', all => {
      session.onAnyChangeTo(all.querySelector('thead'), thead => {
        if (all.querySelector('colgroup .my_comments')) {
          eus.toast.fire({
            title: 'Review table modified — Refresh the page to update groupings',
          });
        }
      });

      if (!all.querySelector('colgroup .my_comments')) {
        if (GM_getValue('showAddMyCommentsColumnDialog', true)) {
          GM_setValue('showAddMyCommentsColumnDialog', false);
          swal.fire({
            html: '<p>To enable dashboard sorting via the userscript, add the <code>My Comments</code> column to the table.</p>'
              + "<img style='border-radius: 10px; border: 2px solid #eee' src='data:image/png;base64,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' />",
          });
        }
        return;
      }

      const incompleteTable = copyEmptyTable(all);
      const reviewedTable = copyEmptyTable(all);
      const shipItTable = copyEmptyTable(all);

      for (const tr of all.querySelectorAll('tbody tr')) {
        if (tr.querySelector('.rb-icon-datagrid-comment-shipit')) {
          shipItTable.querySelector('tbody').append(tr);
        } else if (tr.querySelector('.rb-icon-datagrid-comment')) {
          reviewedTable.querySelector('tbody').append(tr);
        } else {
          incompleteTable.querySelector('tbody').append(tr);
        }
      }

      all.parentNode.append(groupRows(incompleteTable, 'Incomplete', true));
      all.parentNode.append(groupRows(reviewedTable, 'Reviewed', true));
      all.parentNode.append(groupRows(shipItTable, 'Ship It!', false));

      function copyEmptyTable(table) {
        const newTable = table.cloneNode(true);
        newTable.querySelector('thead').remove();
        for (const tr of newTable.querySelectorAll('tbody tr')) {
          tr.remove();
        }
        return newTable;
      }

      function groupRows(table, name, open) {
        const rows = table.querySelectorAll('tbody tr');

        let i = 0;
        for (const row of rows) {
          row.classList.toggle('even', i % 2 === 0);
          row.classList.toggle('odd', i % 2 === 1);
          i += 1;
        }

        const summary = document.createElement('summary');
        summary.innerText = `${name} (${rows.length})`;

        const details = document.createElement('details');
        details.classList.add('review-category');
        details.open = open;

        details.append(summary);
        details.append(table);

        return details;
      }
    });
  });

  function removeImmediateInnerText(node) {
    let nextChild;
    let child = node.firstChild;
    while (child) {
      nextChild = child.nextSibling;
      if (child.nodeType === 3) {
        node.removeChild(child);
      }
      child = nextChild;
    }
  }

  async function getReviewBoardRequest(requestId) {
    return (await (await fetch(`https://review-board.natinst.com/api/review-requests/${requestId}/`)).json()).review_request;
  }

  async function* getReviewBoardPagingResults(url, valueProperty) {
    let nextUrl = `${url}?max-results=200`;
    do {
      // eslint-disable-next-line no-await-in-loop
      const reviewData = (await (await fetch(nextUrl)).json());
      nextUrl = reviewData.links.next ? reviewData.links.next.href : null;
      yield* reviewData[valueProperty];
    } while (nextUrl);
  }

  function getReviewBoardReviews(requestId) {
    return getReviewBoardPagingResults(`https://review-board.natinst.com/api/review-requests/${requestId}/reviews/`, 'reviews');
  }

  function getReviewBoardDefaultReviewers() {
    return getReviewBoardPagingResults('https://review-board.natinst.com/api/default-reviewers/', 'default_reviewers');
  }

  async function postReview(requestId, markdown) {
    const response = await fetch(`https://review-board.natinst.com/api/review-requests/${requestId}/reviews/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: toFormData({
        api_format: 'json',
        public: 1,
        body_top: markdown,
        body_top_text_type: 'markdown',
      }),
    });
    // If the user submitting this review already has a pending draft review on this review request, then this will update the existing draft and return HTTP 303 See Other. Otherwise, this will create a new draft and return HTTP 201 Created. Either way, this request will return without a payload and with a Location header pointing to the location of the new draft review.
    return response.json();
  }

  function toFormData(object) {
    const data = new URLSearchParams();
    Object.keys(object).forEach(key => data.set(key, object[key]));
    return data;
  }

  GM_addStyle(/* css */ `
    /* Remove ugly backgrounds on many pages. */
    .main, .box { background-image: none !important; }

    /* Make the top navbar transparent with the background. */
    #topbar { background: none !important; padding: 5px 0px }

    /* Simplify navbar. */
    #title .version { display: none }
    #accountnav > li:first-child { display: none !important }

    /* Make the top-right avatar round. */
    .user-nav-item img { border-radius: 100px; }

    /* Make the search box smaller unless you type into it. */
    input[type=search] {
      width: 15em;
      padding: 5px 1px;
      border: 2px solid #999999;
      border-radius: 3px;
    }
    input[type=search]:placeholder-shown {
      width: 8em;
      opacity: 1.0;
    }

    /* Make the navbar possible to be on a compact single line. */
    #rbinfo, #navbar {
      padding-left: 40px;
      position: relative;
      float: left;
      border: 0;
    }

    /* Make the logo on top-left smaller. */
    #rbinfo img {
      width: 20px !important;
      height: 20px !important;
    }

    /* Standardize all links. */
    a, a:visited {
      text-decoration: none;
      color: #22f;
    }

    /* Make the reviews UI less wide. */
    body.ni-width-readable #review_request .review-request {
      margin: auto auto;
      max-width: 120em;
    }
    body.ni-width-readable #reviews {
      margin: auto auto;
      max-width: 100em;
    }

    /* Give some padding to the top review request info section. */
    #review_request .review-request .main {
      padding: 1em 2em;
    }

    /* Make the border around gravatars more solid and give it a subtle drop shadow. */
    .gravatar-container, .user-nav-item img {
      border-style: none !important;
      box-shadow: 1px 1px 4px #00000080;
    }

    /* Fix issues with avatars and review comments not appear flush with each other. */
    #reviews .box {
      margin-top: 0;
      margin-bottom: 3em;
    }

    /* Give the user avatar some spacing before your username . */
    #accountnav .user-nav-item img { margin-right: 1ex; }

    /* Highlighting your username should keep the text visible on white backdrop. */
    #accountnav:hover .user-nav-item { color: #000 !important; }

    /* Remove some useless header text in the review UI. */
    #fieldset_info_head, #fieldset_reviewers_head, label[for=field_description], label[for=field_summary] {
      display: none;
    }

    /* Make the review title bigger. */
    #field_summary { font-size: 200% !important; }

    /* Make modal boxes a normal, usable size. */
    .modalbox {
      width: auto !important;
      height: auto !important;
    }
    .modalbox-inner {
      background: none;
    }
    .modalbox-contents {
      width: auto !important;
      height: auto !important;
      min-width: 40vw;
      min-height: 20vh;
      max-width: 90vw;
      max-height: 80vh;
      overflow: auto;
      display: block;
    }
    .modalbox-contents .text-editor {
      width: 55vw !important;
    }
    .modalbox .modalbox-buttons {
      position: relative !important;
    }

    /* Make all buttons bigger. */
    input[type=button] {
      font-size: 130% !important;
      font-weight: bold;
    }

    /* Make the sub-comment headers more prominent. */
    .reply-comments > li dl {
      margin: 2em 0 !important;
      padding: 0 !important;
    }
    .reply-comments > li dl dt {
      border-top: 2px solid #ccc;
    }
    .reply-comments > li dl dd {
      padding: 0.5em 7em !important;
    }
    .review .header, .reply-comments > li dl dt {
      background: #f8f8f8;
      padding: 1em 2em;
    }
    .user-reply-info {
      margin-left: 10px;
    }
    .reply-comments .rich-text:not(.line) {
      padding: 0 !important;
    }

    /* Make comment spacing tighter. */
    #reviews .review .body .body_top,
    #reviews .review .body .body_bottom {
      margin: 1em 0 0 0;
    }

    /* Make comments bigger and nicer font. */
    .rich-text:not(.line), .editable.field-text-area, .CodeMirror {
      padding: 0.8em 1.5em !important;
      font-size: 140% !important;
      line-height: 150% !important;
    }

    /* Make the comment text editor a little nicer. */
    .CodeMirror {
      border: 1px solid #eee !important;
      border-radius: 5px;
      padding: 0 !important;
    }

    /* Make review comment threads less ugly. */
    .box-inner { background: none !important; }
    .box-main { padding: 0px; }
    .box .header { padding: 20px 25px !important }
    .review .box { background: #fff !important; }
    .review .box .body { padding: 0; }
    .changedesc .box .body { padding: 1em 4em; }

    /* Style some categories for the review dashboard. */
    details.review-category summary {
      padding: 0.5em 2em;
      font-size: 1.5em;
      background: #ccd;
      cursor: pointer;
    }

    /* Make rows in the data grid a bit more spaced out. */
    .datagrid-body tr td {
      padding: 10px 5px !important;
    }

    /* Make the groups & people listing a vertical list, one item per line. */
    #fieldset_reviewers_body:not(.original-look) a {
      display: block;
      line-height: 1.5em;
      margin-bottom: 10px;
    }

    /* Show a refresh page notice when the user is editing users/groups for the review request. */
    #fieldset_reviewers_body .refresh-page-notice {
      background: #fcc;
      border-radius: 5px;
      border: 1px solid #f88;
      padding: 1ex 2ex;
      margin: 2ex 0ex;
      text-align: center;
    }
    #fieldset_reviewers_body:not(.original-look) .refresh-page-notice {
      display: none;
    }

    /* Style the vote annotations we'll add to people and groups. */
    a .vote {
      margin-left: 0.5ex;
      cursor: help;
    }

    /* Make the diff background header more visible. */
    #diffs .diff-highlight {
      background: rgba(0, 0, 255, 0.4);
    }

    /* Make the data grid table auto size vertically. */
    .datagrid-body-container {
      min-height: 400px;
      height: auto !important;
    }

    /* Handle vertical space better... more scrolling, less cropping. */
    .datagrid-main {
      overflow: auto !important;
    }
    #container {
      position: inherit !important;
      padding-bottom: 10vh;
    }
    body:not(.reviewable-page) #container {
      /* Exclude review pages, to fix bug #16 (horizontal scrollbars not visible for wide diffs). */
      overflow: auto !important;
    }

    /* Make it clear that you can press the header to expand/collapse now. */
    .header {
      cursor: pointer;
    }

    /* For some reason, RB wants to size this main review request container. By doing so, it sometimes lets items overlap with each other. Let's disable that. */
    #review_request_main {
      height: auto !important;
    }

    /* Make the banners nicer. */
    #draft-banner, #discard-banner, #submitted-banner {
      box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.3);
      margin: 30px 10px;
      border-radius: 10px;
    }

    /* Make the submitted banner green. */
    #submitted-banner {
      background: #ada;
    }

    /* Make the review draft, review request draft, and draft comment banners yellow. */
    #review-banner .banner, #draft-banner.banner, #reviews .review.has-draft .header, #reviews .banner {
      background: #fd6;
      border-color: #555;
    }

    /* Make the owners paragraph special looking. */
    .owner-info {
      background: #eee;
      border: 1px solid #ddd;
      padding: 1em 2em;
      border-radius: 5px;
      transition: 0.3s;
    }
    .owner-info button {
      display: block;
      margin-top: 1em;
      padding: 0.25em 1em;
      font-weight: bold;
    }

    /* Make user status in the owners block look distinct (helpful when you have a big review). */
    .owner-info .user-status {
      background: #fdfdfd;
      border: 1px solid #eaeaea;
      padding: 0ex 0.5ex;
      border-radius: 5px;
    }

    /* Theming! */

    body.ni-dark {
      background: #223;
    }
    body.ni-dark #title,
    body.ni-dark .user-nav-item,
    body.ni-dark .page-sidebar-items,
    body.ni-dark .page-sidebar-items .item:not(.active) {
      color: #ddd !important;
    }
    body.ni-dark .page-sidebar-items h3.label,
    body.ni-dark .datagrid-title {
      color: #aaa !important;
    }
    body.ni-dark .page-sidebar-items .item:not(.active) .count {
      color: #ea4 !important;
    }
    body.ni-dark #navbar a,
    body.ni-dark .datagrid-top-filters a {
      color: #66f !important;
    }

    body.ni-middle {
      background: #779;
    }
    body.ni-middle #title,
    body.ni-middle .user-nav-item,
    body.ni-middle .page-sidebar-items,
    body.ni-middle .page-sidebar-items .item:not(.active) {
      color: #eee !important;
    }
    body.ni-middle .page-sidebar-items h3.label,
    body.ni-middle .datagrid-title {
      color: #ccc !important;
    }
    body.ni-middle .page-sidebar-items .item:not(.active) .count {
      color: #fb2 !important;
    }
    body.ni-middle #navbar a,
    body.ni-middle .datagrid-top-filters a {
      color: #ccf;
    }

    body.ni-light {
      background: #e8e8e8;
    }

    /* Fix sidebar colors when the above themes are applied. */
    .page-sidebar-items .item:not(.active):not(:hover) a {
     color: inherit !important;
    }
    .page-sidebar-items .item.active a {
      color: #000 !important;
    }

    /* Give rich text boxes rounded corners. */
    .rich-text:not(.line), .field {
      border-radius: 5px;
    }

    /* Color user comments differently. */
    .review .header { background: #ccf; }
    .changedesc .header { background: #eee; }
    .review.users-prebuild .header, .review.user-action .header { background: #eee; }
    .review.users-prebuild.old { opacity: 0.3; }

    /* Support reordering the review feed newest-first. */
    body.ni-feed-newest-first #reviews {
      display: flex;
      flex-direction: column-reverse;
    }
    body.ni-feed-newest-first #reviews #view_controls {
      order: 100000;
    }

    /* Fix a bug where the page does not use up all available page width. */
    #container { width: 100%; }

    /* Style a decline and reset button for reviewers. */
    #field_target_people {
      max-width: initial !important;
      width: 100%;
    }
    .user-status.declined {
      opacity: 0.35;
      text-decoration: line-through;
    }
    button.user-action {
      float: right;
      padding: 0px 5px;
      margin: 0px 2px;
      font-size: 115%;
      opacity: 0.15;
      transition: 0.2s;
      border: none;
      background: none;
      border-radius: 3px;
    }
    #field_target_people:hover button.user-action {
      opacity: 0.8;
    }
    button.user-action:hover {
      cursor: pointer;
      opacity: 1.0;
      background: #ddd;
    }

    /* Style the file regex patterns for default reviewers in groups list. */
    .default-reviewer-info {
      background: #f0f0f0;
      padding-left: 1em;
      font-family: Consolas, "Lucida Console", Monaco, monospace;
      overflow-wrap: anywhere;
      white-space: normal;
      line-height: normal;
      padding: 1ex 2ex;
    }

    /* Option: Add scrollbars to long horizontal diffs. */
    body.ni-diff-scrollbars .comment_container,
    body.ni-diff-scrollbars #diffs .diff-box {
      overflow-x: auto;
    }

    /* Option: Word wrap long horizontal diffs. */
    body.ni-diff-wordwrap .comment_container,
    body.ni-diff-wordwrap #diffs .diff-box {
      word-break: break-all;
    }
    body.ni-diff-wordwrap .comment_container tbody th,
    body.ni-diff-wordwrap #diffs .diff-box tbody th {
      /* Don't break in the middle of a line number. */
      word-break: normal;
    }

    /* Show absolute times if the user wants it. */
    .timestamp-absolute {
      display: none;
    }
    body.ni-show-absolute-times .timestamp-absolute,
    body.ni-show-smart-times .timestamp-absolute.old-enough-timestamp {
      display: initial;
    }
    body.ni-show-smart-times .time {
      display: none;
    }

    /* Nicer scrollbars. */
    *::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    *::-webkit-scrollbar-track {
      border: 1px solid #aaaaaa40;
      background: none;
    }
    *::-webkit-scrollbar-thumb {
      background: #bbb;
      border: 1px solid #bbb;
      border-radius: 5px;
    }

    /* Make more things Consolas. */
    pre, textarea, .CodeMirror, .editable.field-text-area, tt, code, kbd, samp, .changedesc .body .diffed-text-area td {
      font-family: Consolas, "Lucida Console", Monaco, monospace;
    }
  `);
}());
