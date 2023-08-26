# Obsidian File Activity Plugin

This [Obsidian](https://obsidian.md/) plugin adds a visualization showing what you have recently linked to.

I created this to support my personal workflow, where most of my note-taking happens in my [Daily Note](https://help.obsidian.md/Plugins/Daily+notes) (with the help of the [Calendar](https://github.com/liamcain/obsidian-calendar-plugin) plugin), with frequent links out to many diffrerent "topic" pages. The topic pages backlinks then serve as a collection of raw thoughts, which I can use as source material for focused writing. 

Often I want to continue referring to the same topic for many days in a row, or elaborate on ideas from a few days before. So I made this plugin to keep track of all the topics I've been linking to.

Note that the plugin counts links by the date the file was *created*. This works well for a "daily notes" workflow, but will not capture links in pages you contribute to continuously over time. It would easy to modify the plugin to track this, though. It would be harder to track links by the day each individual link was created, but not impossible, so please open an issue if this is of interest.

### Acknowledgments

This plugin was based in large part on the [Recent Files](https://github.com/tgrosinger/recent-files-obsidian) plugin by tgrosinger.

### Releasing

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

### Manually installing the plugin

Copy over `main.js`, `styles.css`, `manifest.json` to your vault, e.g. by:
```
PLUGIN_DIR=$VAULT_DIR/.obsidian/plugins/file-activity-dev/
mkdir $PLUGIN_DIR
npm run build
cp main.js manifest.json styles.css $PLUGIN_DIR
```
