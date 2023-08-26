
import { App, ItemView, Menu, TFile, WorkspaceLeaf } from 'obsidian';
import { DisplayEntry, Link, PluginConfig, ResolvedLink, UnresolvedLink, pathToLinkText } from "./data";
import FileActivityPlugin, { VIEW_TYPE } from './main';
import { getSparklineAsInlineStyle } from './sparkline';

import { Signal } from '@preact/signals';
import { html } from "htm/preact";
import { RefObject, VNode, createRef, h, render } from "preact";


function FileActivity(props: {entries: Signal<DisplayEntry[]>, config: Signal<PluginConfig>, app: App}): VNode {
  const openFilePath = props.app.workspace.getActiveFile()?.path

  return html`<div class="nav-folder mod-root">
    <div class="nav-folder-children">
      ${props.entries.value.map(entry => ActivityItem({
        counts: entry.counts,
        link: entry.link,
        app: props.app, 
        isOpenFile: (openFilePath !== undefined && 
          entry.link.isResolved && entry.link.path === openFilePath),
        openType: props.config.value.openType
      }))}
    </div>
  </div>`
}

type ItemProps = {
  counts: number[];
  link: Link,
  isOpenFile: boolean | undefined;
  app: App;
  openType: "split" | "window" | "tab";
}

function ActivityItem(props: ItemProps): VNode {
  
  const ref = createRef()
  const sparkline = getSparklineAsInlineStyle(props.counts, Math.max(...props.counts), 10)
  return html`
    <div class="nav-file file-activity-file">
      <div class="nav-file-title file-activity-title ${props.isOpenFile ? 'is-active' : ''}" ref=${ref}>
        ${props.link.isResolved
          ? ResolvedLinkItem({...props, parentRef: ref} as ItemProps & {link: ResolvedLink, parentRef: RefObject<HTMLElement>}) 
          : UnresolvedLinkItem(props as ItemProps & {link: UnresolvedLink})}
        <div class="file-activity-graph" style="${sparkline}"></div>
      </div>
    </div>
  `
}

function ResolvedLinkItem(props: ItemProps & {link: ResolvedLink, parentRef: RefObject<HTMLElement>}) {
  const ref = createRef();
  const entryText = pathToLinkText(props.link.path)
  
  const focusFile = async (): Promise<void> => {
    const targetFile = props.app.vault.getAbstractFileByPath(props.link.path);
  
    if (targetFile !== null && (targetFile instanceof TFile)) {
      let leaf: WorkspaceLeaf | null = props.app.workspace.getMostRecentLeaf();
  
      if (leaf === null || leaf.getViewState().pinned) {
        leaf = props.app.workspace.getLeaf(props.openType);
      }
      if (leaf !== null)
        leaf.openFile(targetFile);
    }
  };
  
  const dragFile = (event: DragEvent) => {
    const file = props.app.metadataCache.getFirstLinkpathDest(
      props.link.path,
      '',
    );
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dragManager = (props.app as any).dragManager;
    const dragData = dragManager.dragFile(event, file);
    dragManager.onDragStart(event, dragData);
  }

  const hoverLink = (event: MouseEvent) => props.app?.workspace.trigger('hover-link', {
    event,
    source: VIEW_TYPE,
    targetEl: ref.current,
    hoverParent: props.parentRef.current,
    linktext: entryText,
  })

  const contextMenu = (event: MouseEvent) => {
    const menu = new Menu();
    const file = props.app.vault.getAbstractFileByPath(props.link.path);
    props.app.workspace.trigger(
      'file-menu',
      menu,
      file,
      'link-context-menu',
    );
    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  return html`
  <div 
    ref=${ref}
    class="nav-file-title-content file-activity-title-content"
    draggable="true"
    onClick=${focusFile}
    onDragStart=${dragFile}
    onMouseOver=${hoverLink}
    onContextMenu=${contextMenu}
  >
    ${entryText}
  </div>
  `
}

function UnresolvedLinkItem(props: ItemProps & {link: UnresolvedLink}) {
  const searchFile = () => {
    window.location.href = `obsidian://search?vault=${props.app.vault.getName()}&query=[[${props.link.text}]]`
  }
  // TODO add a context menu

  return html`
  <div 
    class="nav-file-title-content file-activity-title-content file-activity-unresolved"
    onClick=${() => searchFile()}
  >
    ${props.link.text}
  </div>
  `
}

export default class FileActivityListView extends ItemView {
  private readonly plugin: FileActivityPlugin;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private component: VNode<any>
  private displayEntries: Signal<DisplayEntry[]>
  private config: Signal<PluginConfig>

  constructor(
    leaf: WorkspaceLeaf,
    plugin: FileActivityPlugin,
    displayEntries: Signal<DisplayEntry[]>,
    config: Signal<PluginConfig>
  ) {
    super(leaf);
    this.plugin = plugin;
    this.displayEntries = displayEntries
    this.config = config
  }

  public async onOpen(): Promise<void> {

    this.contentEl.empty()
    this.component = h(FileActivity, {entries: this.displayEntries, config: this.config, app: this.plugin.app})

    render(
      this.component,
      this.contentEl
    );
  }

  public getViewType(): string {
    return VIEW_TYPE;
  }

  public getDisplayText(): string {
    return 'File Activity';
  }

  public getIcon(): string {
    return 'activity';
  }
}
