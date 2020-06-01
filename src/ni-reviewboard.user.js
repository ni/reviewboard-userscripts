// ==UserScript==
// @name         More Awesome NI Review Board
// @version      1.4.0
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
// @require      https://gist.githubusercontent.com/alejandro5042/af2ee5b0ad92b271cd2c71615a05da2c/raw/easy-userscripts.js?v=71#sha384-wap0YOqYtSdG40UHxvqTwNbx08/Q0qskXT/Kl9uGHwt0f9OIH7pQP7JwT6wod2F2
// ==/UserScript==

/* global eus, swal */

(function () {
  eus.globalSession.onFirst(document, 'body', () => {
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
    eus.globalSession.on(document, '.header', 'click', (event, header) => {
      const clickedOnButton = event.target.closest('.collapse-button');
      if (clickedOnButton) return;
      header.querySelector('.collapse-button').click();
    });

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

      // Annotate approval details on users and groups.
      eus.globalSession.onFirst(document, '#fieldset_reviewers_body', async (targetPeopleAndGroups) => {
        const groupsField = document.getElementById('field_target_groups');
        const peopleField = document.getElementById('field_target_people');

        // The edit button copies the field element HTML text into a text box. Well, if we are modifying it, it'll be wrong when it gets copied into the text box. So let's reset it.
        const originalGroupsText = groupsField.innerText;
        eus.globalSession.onFirst(document, '#field_target_groups + a.editicon', link => {
          link.addEventListener('click', () => {
            groupsField.innerText = originalGroupsText;
            eus.toast.fire({ title: 'When you are done modifying groups, refresh the page to re-annotate.' });
          }, true); // capture=true to be the first to handle the click.
        });

        // The edit button copies the field element HTML text into a text box. Well, if we are modifying it, it'll be wrong when it gets copied into the text box. So let's reset it.
        const originalPeopleText = peopleField.innerText;
        eus.globalSession.onFirst(document, '#field_target_people + a.editicon', link => {
          link.addEventListener('click', () => {
            peopleField.innerText = originalPeopleText;
            eus.toast.fire({ title: 'When you are done modifying users, refresh the page to re-annotate.' });
          }, true); // capture=true to be the first to handle the click.
        });

        // Remove commas between names.
        removeImmediateInnerText(groupsField);
        removeImmediateInnerText(peopleField);

        // Go through each user and record their approval.
        const userVotes = {};
        let previousPrebuildReviewElements = [];
        for await (const review of getReviewBoardReviews(requestId)) {
          if (!review.public) continue;

          const userUrl = review.links.user.href.replace('https://review-board.natinst.com/api', '');
          const userIsPrebuild = userUrl === '/users/prebuild/';
          const reviewElement = document.querySelector(`.review[data-review-id="${review.id}"]`);
          let customReviewElementLabel = null;
          let customReviewElementSubHeader = null;

          if (userIsPrebuild) {
            // Record the vote of a build user.

            const comment = review.body_top;
            let match;
            if (!(userUrl in userVotes) || userVotes[userUrl] === '💬') {
              userVotes[userUrl] = '';
            }

            if (comment.match(/going to check/)) {
              userVotes[userUrl] = '';
              if (reviewElement) {
                for (const element of previousPrebuildReviewElements) {
                  element.classList.add('old');
                }
              }
              previousPrebuildReviewElements = [];
            // eslint-disable-next-line no-cond-assign
            } else if (match = comment.match(/successfully built the changes on ([a-z]*)/i)) {
              userVotes[userUrl] += `<br> ⤷ ${match[1]} ✅`;
              customReviewElementLabel = '<label class="ship-it-label">Pass</label>';
              customReviewElementSubHeader = ` &mdash; ${match[1]}`;
            // eslint-disable-next-line no-cond-assign
            } else if (match = comment.match(/^Build failed on ([a-z]*)/i)) {
              userVotes[userUrl] += `<br> ⤷ ${match[1]} ❌`;
              customReviewElementLabel = '<label class="fix-it-label">Fail</label>';
              customReviewElementSubHeader = ` &mdash; ${match[1]}`;
            } else if (comment.match(/fail/i)) {
              userVotes[userUrl] += '<br> ⤷ <em>other</em> ❌';
              customReviewElementLabel = '<label class="fix-it-label">Fail</label>';
            } else {
              userVotes[userUrl] += '<br> ⤷ ❓';
            }
          } else {
            // Record the vote of a non-build user.
            const vote = review.ship_it ? ' ✅' : ' 💬';
            userVotes[userUrl] = vote;
          }

          // Annotate the review on the HTML page.
          if (reviewElement) {
            reviewElement.classList.add(eus.toCss(userUrl));
            if (customReviewElementLabel) {
              reviewElement.querySelector('.labels-container').insertAdjacentHTML('beforeend', customReviewElementLabel);
            }
            if (customReviewElementSubHeader) {
              if (reviewElement) reviewElement.querySelector('.header a.user').insertAdjacentHTML('beforeend', customReviewElementSubHeader);
            }
          }

          if (userIsPrebuild) {
            previousPrebuildReviewElements.push(reviewElement);
          }
        }

        // Annotates the `.niconfig` owner review block with approvals.
        const owners = document.querySelector('#field_beanbag_notefield_notes > p:last-child');
        if (owners && owners.innerText.includes('.niconfig Owners')) {
          let ownersHtml = owners.innerHTML;

          const ownersText = owners.innerText.split('\n').filter(l => l.match(/^\.niconfig/));
          const rolesToUsers = {};
          for (let line of ownersText) {
            line = line.replace('.niconfig', '').replace(/\s/gi, '');
            const [role, users] = line.split(':', 2);
            rolesToUsers[role.toLowerCase()] = users.split(',');
          }

          for (const userUrl in userVotes) {
            if (Object.prototype.hasOwnProperty.call(userVotes, userUrl)) {
              const username = userUrl.replace('/users/', '').replace('/', '');
              const annotation = username + userVotes[userUrl];
              ownersHtml = ownersHtml.replace(username, annotation);
            }
          }

          owners.innerHTML = ownersHtml;
          owners.classList.add('owner-info');
        }

        // Annotate users on the right.
        for (const userUrl in userVotes) {
          if (Object.prototype.hasOwnProperty.call(userVotes, userUrl)) {
            for (const link of document.querySelectorAll(`#review_request a[href="${userUrl}"]`)) {
              link.insertAdjacentHTML('beforeend', userVotes[userUrl]);
            }
          }
        }

        // Annotate groups on the right.
        const reviewRequest = await getReviewBoardRequest(requestId);
        for (const group of reviewRequest.target_groups) {
          // Fetch each group in parallel.
          fetch(`${group.href}/users/`)
            .then(response => response.json())
            .then(groupMembers => {
              const groupUrl = `/groups/${group.title}/`;
              for (const user of groupMembers.users) {
                const vote = userVotes[user.url];
                if (vote) {
                  for (const link of document.querySelectorAll(`#review_request a[href="${groupUrl}"]`)) {
                    link.insertAdjacentHTML('beforeend', `<br>⤷ ${user.username}${vote}`);
                  }
                }
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

  async function* getReviewBoardReviews(requestId) {
    let nextReviewsFetchUrl = `https://review-board.natinst.com/api/review-requests/${requestId}/reviews/?max-results=200`;
    do {
      // eslint-disable-next-line no-await-in-loop
      const reviewData = (await (await fetch(nextReviewsFetchUrl)).json());
      nextReviewsFetchUrl = reviewData.links.next ? reviewData.links.next.href : null;
      yield* reviewData.reviews;
    } while (nextReviewsFetchUrl);
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
    #fieldset_info_head, label[for=field_description], label[for=field_summary] {
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
    #fieldset_reviewers_body a {
      display: block;
      line-height: 1.5em;
      margin-bottom: 10px;
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
      overflow: auto !important;
      padding-bottom: 10vh;
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

    /* Make the review draft banner yellow. */
    #review-banner .banner {
      background: #fd6;
      border-color: #555;
    }

    /* Make the owners paragraph special looking. */
    .owner-info {
      background: #eee;
      border: 1px solid #ddd;
      padding: 1em 2em;
      border-radius: 5px;
    }
    .owner-info button {
      display: block;
      margin-top: 1em;
      padding: 0.25em 1em;
      font-weight: bold;
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
    .rich-text:not(.line) {
      border-radius: 5px;
    }

    /* Color user comments differently. */
    .review .header { background: #ccf; }
    .changedesc .header { background: #eee; }
    .review.users-prebuild .header { background: #eee; }
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
  `);
}());
