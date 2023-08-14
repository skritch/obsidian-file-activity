
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import FileActivityPlugin from './main';
import { DEFAULT_DATA } from "./data";


export default class FileActivitySettingTab extends PluginSettingTab {
  private readonly plugin: FileActivityPlugin;
  
  constructor(app: App, plugin: FileActivityPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  
  public display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'File Activity' });
    
    const fragment = document.createDocumentFragment();
    const link = document.createElement('a');
    link.href =
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
    link.text = 'MDN - Regular expressions';
    fragment.append('RegExp patterns to ignore. One pattern per line. See ');
    fragment.append(link);
    fragment.append(' for help.');
    
    // todo allow only .md extensions?
    
    new Setting(containerEl)
    .setName('Omitted pathname patterns')
    .setDesc(fragment)
    .addTextArea((textArea) => {
      textArea.inputEl.setAttr('rows', 6);
      textArea
      .setPlaceholder('^daily/\n^journal/\n\\.png$\nfoobar.*baz')
      .setValue(this.plugin.data.disallowedPaths.join('\n'));
      textArea.inputEl.onblur = (e: FocusEvent) => {
        const patterns = (e.target as HTMLInputElement).value;
        this.plugin.data.disallowedPaths = patterns.split('\n');
        // this.plugin.pruneOmittedFiles();
        this.plugin.saveData()
        this.plugin.view.redraw();
      };
    });
    
    new Setting(containerEl)
    .setName('Number of Files')
    .setDesc('Maximum number of files to track.')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_DATA.maxLength);
      text
      .setValue(this.plugin.data.maxLength?.toString())
      .onChange((value) => {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed <= 0) {
          new Notice('Number of files must be a positive integer');
          return;
        }
      });
      text.inputEl.onblur = (e: FocusEvent) => {
        const maxfiles = (e.target as HTMLInputElement).value;
        const parsed = parseInt(maxfiles, 10);
        this.plugin.data.maxLength = parsed;
        // this.plugin.pruneLength();
        this.plugin.saveData();
        this.plugin.view.redraw();
      };
    });
    
    new Setting(containerEl)
    .setName("Open note in")
    .setDesc("Open the clicked recent file record in a new tab, split, or window (only works on the desktop app).")
    .addDropdown((dropdown) => {
      const options: Record<string, string> = {
        "tab": "tab",
        "split": "split",
        "window": "window",
      };
      
      dropdown
      .addOptions(options)
      .setValue(this.plugin.data.openType)
      .onChange(async (value) => {
        this.plugin.data.openType = value;
        await this.plugin.saveData();
        this.display();
      });
    });
  }
}
