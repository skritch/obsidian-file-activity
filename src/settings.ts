
import { Signal } from '@preact/signals';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_CONFIG, PluginConfig } from "./data";
import FileActivityPlugin from './main';


export default class FileActivitySettingTab extends PluginSettingTab {
  private readonly plugin: FileActivityPlugin;
  private config: Signal<PluginConfig>
  
  constructor(app: App, plugin: FileActivityPlugin, config: Signal<PluginConfig>) {
    super(app, plugin);
    this.plugin = plugin;
    this.config = config
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
      .setValue(this.config.peek().disallowedPaths.join('\n'));
      textArea.inputEl.onblur = (e: FocusEvent) => {
        const patterns = (e.target as HTMLInputElement).value;
        this.config.value = {...this.config.peek(), disallowedPaths: patterns.split('\n')};
      };
    });
    
    new Setting(containerEl)
    .setName('Number of Files')
    .setDesc('Maximum number of files to track.')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_CONFIG.maxLength);
      text
      .setValue(this.config.peek().maxLength?.toString())
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
        this.config.value = {...this.config.peek(), maxLength: parsed}
      };
    });


    new Setting(containerEl)
    .setName('Activity Days')
    .setDesc('Number of days of activity to use in ranking and visualizing')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_CONFIG.activityDays);
      text
      .setValue(this.config.peek().activityDays?.toString())
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
        this.config.value = {...this.config.peek(), activityDays: parsed}
      };
    });

    new Setting(containerEl)
    .setName('Downranking Factor')
    .setDesc('Factor by which older links are downweighted. Small numbers (much less than 1) will bias towards very recent activity.')
    .addText((text) => {
      text.inputEl.setAttr('type', 'number');
      text.inputEl.setAttr('placeholder', DEFAULT_CONFIG.weightFalloff);
      text
      .setValue(this.config.peek().weightFalloff?.toString())
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
        this.config.value = {...this.config.peek(), weightFalloff: parsed}
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
      .setValue(this.config.peek().openType)
      .onChange(async (value: "split" | "tab" | "window") => {
        this.config.value = {...this.config.peek(), openType: value}
      });
    });
  }
}
