# How to contribute

## Status

This project is in active development, with primary focus on NI developers.

## Submitting changes

Pull requests are welcomed :)

For significant effort or feature work, please start by filing an issue to discuss your approach; preferably before you start coding.

## Editing

- Open your userscript extension and make edits
- Hit `Ctrl+S` to save
- Refresh the target page to test your changes

Once you're done, copy your script from the dashboard into the actual source file, either from an on-disk clone of this repo or directly on the [GitHub interface](https://help.github.com/en/github/managing-files-in-a-repository/editing-files-in-your-repository). Then propose a pull request.

## Debugging

- `console.log(message)` debugging is probably your easiest
- Set breakpoints and inspect objects using Chrome DevTools (the userscript will show up under the Sources tab, and will be at the bottom of the `*.user.js` file)

## Using a local editor

The process for Violentmonkey is simpler than with Tampermonkey.

- Clone the repo
- Follow the instructions [here](https://violentmonkey.github.io/posts/how-to-edit-scripts-with-your-favorite-editor/#install-a-local-script), ensuring you checked "track local file"
- Open your favorite editor and hack away!

For code hints in VS Code:

- Install the eslint [extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- Run `npm install` (e.g. with this [[extension](https://marketplace.visualstudio.com/items?itemName=eg2.vscode-npm-script)])
- Reopen the script

## Validating your changes

Make sure your change:

- Runs in latest stable Chrome and Firefox without Javascript errors
- Does not report any issues with `eslint` (run `npm run build` -- the PR build will also check this)
- Increment version following [semver](https://semver.org/)
- All `@require` and `@resource` URLs must have SRI ([use this hashing tool](https://www.srihash.org/))
- Blocks of code are commented

## Testing pull request changes

To test the changes in a pull request:

- Disable existing versions of the userscript
- Install the new userscript from the GitHub PR
  - Go to the `Files Changed` tab
  - Hit the `...` button on the top-right of the file
  - Hit `View file`
  - Hit `Raw` button in the page that comes up
- Test
- Delete the userscript from the PR
- Re-enable your original userscripts
