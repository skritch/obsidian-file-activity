
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
    
    new Setting(containerEl)
    .setName('Omitted pathname patterns')
    .setDesc(fragment)
    .addTextArea((textArea) => {
      textArea.inputEl.setAttr('rows', 6);
      textArea
      .setPlaceholder('^journal/\nfoobar.*')
      .setValue(this.plugin.data.config.disallowedPaths.join('\n'));
      textArea.inputEl.onblur = (e: FocusEvent) => {
        const patterns = (e.target as HTMLInputElement).value;
        this.plugin.data.config.disallowedPaths = patterns.split('\n');
        this.plugin.saveData()
        this.plugin.view.redraw();
      };
    });
    
    new Setting(containerEl)
    .setName('Number of Files')
    .setDesc('Maximum number of files to track.')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_DATA().config.maxLength);
      text
      .setValue(this.plugin.data.config.maxLength?.toString())
      .onChange((value) => {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed <= 0) {
          new Notice('Must be a positive integer');
          return;
        }
      });
      text.inputEl.onblur = (e: FocusEvent) => {
        const maxfiles = (e.target as HTMLInputElement).value;
        const parsed = parseInt(maxfiles, 10);
        this.plugin.data.config.maxLength = parsed;
        // this.plugin.pruneLength();
        this.plugin.saveData();
        this.plugin.view.redraw();
      };
    });


    new Setting(containerEl)
    .setName('Activity Days')
    .setDesc('Number of days of activity to use in ranking and visualizing')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_DATA().config.activityDays);
      text
      .setValue(this.plugin.data.config.activityDays?.toString())
      .onChange((value) => {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed) && parsed <= 0) {
          new Notice('Must be a positive integer');
          return;
        }
      });
      text.inputEl.onblur = (e: FocusEvent) => {
        const days = (e.target as HTMLInputElement).value;
        const parsed = parseInt(days, 10);
        this.plugin.data.config.activityDays = parsed;
        this.plugin.saveData();
        this.plugin.view.redraw();
      };
    });

    new Setting(containerEl)
    .setName('Downranking Factor')
    .setDesc('Factor by which older links are downweighted. Small numbers (much less than 1) will bias towards very recent activity.')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_DATA().config.weightFalloff);
      text
      .setValue(this.plugin.data.config.weightFalloff?.toString())
      .onChange((value) => {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed) && parsed <= 0) {
          new Notice('Must be a positive number');
          return;
        }
      });
      text.inputEl.onblur = (e: FocusEvent) => {
        const falloff = (e.target as HTMLInputElement).value;
        const parsed = parseFloat(falloff);
        this.plugin.data.config.weightFalloff = parsed;
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
      .setValue(this.plugin.data.config.openType)
      .onChange(async (value) => {
        this.plugin.data.config.openType = value;
        this.plugin.saveData();
        this.display();
      });
    });
  }
}
