
import { App, ItemView, Menu, TFile, WorkspaceLeaf } from 'obsidian';
import { DisplayEntry, LinkText, PluginConfig } from "./data";
import FileActivityPlugin, { VIEW_TYPE } from './main';
import { getSparklineAsInlineStyle } from './sparkline';

import { Signal } from '@preact/signals';
import { html } from "htm/preact";
import { Ref, RefObject, VNode, createContext, createRef, h, render } from "preact";
import { useContext } from "preact/hooks";

const AppContext = createContext<App | undefined>(undefined)

function FileActivity(props: {entries: Signal<DisplayEntry[]>, config: Signal<PluginConfig>}): VNode {
  const app = useContext(AppContext);

  // TODO: trigger rerender whenever active file changes, somehow.
  const openFilePath = app !== undefined ? app.workspace.getActiveFile()?.path : undefined

  return html`<div class="nav-folder mod-root">
    <div class="nav-folder-children">
      ${props.entries.value.map(entry => ActivityItem({
        counts: entry.counts,
        path: entry.path,
        name: entry.name,
        app: app, 
        isOpenFile: (openFilePath !== undefined && entry.path === openFilePath),
        openType: props.config.value.openType
      }))}
    </div>
  </div>`
}

type ItemProps = {
  counts: number[];
  path: string | undefined;
  isOpenFile: boolean | undefined;
  app: App | undefined;
  openType: "split" | "window" | "tab";
  name: LinkText
}

function ActivityItem(props: ItemProps): VNode {
  
  const ref = createRef()
  const sparkline = getSparklineAsInlineStyle(props.counts, Math.max(...props.counts), 10)
  return html`
    <div class="nav-file file-activity-file">
      <div class="nav-file-title file-activity-title" ref=${ref}>
        ${props.path !== undefined 
          ? ResolvedLink({...props, parentRef: ref} as ItemProps & {path: string, parentRef: RefObject<any>}) 
          : UnresolvedLink(props)}
        <div class="file-activity-graph" style="${sparkline}"></div>
      </div>
    </div>
  `
}

function ResolvedLink(props: ItemProps & {path: string, parentRef: RefObject<any>}) {
  const ref = createRef();

  const focusFile = async (): Promise<void> => {
    if (props.app === undefined) { return; }
    const targetFile = props.app.vault.getAbstractFileByPath(props.path);
  
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
    if (props.app === undefined) { return; }
    const file = props.app.metadataCache.getFirstLinkpathDest(
      props.path,
      '',
    );
  
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dragManager = (props.app as any).dragManager;
    const dragData = dragManager.dragFile(event, file);
    dragManager.onDragStart(event, dragData);
  }

  // Use context to access app?
  const hoverLink = (event: MouseEvent) => props.app?.workspace.trigger('hover-link', {
    event,
    source: VIEW_TYPE,
    targetEl: ref.current,
    hoverParent: props.parentRef.current,
    linktext: props.path,
  })

  const contextMenu = (event: MouseEvent) => {
    if (props.app === undefined) { return; }
    const menu = new Menu();
    const file = props.app.vault.getAbstractFileByPath(props.path);
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
    class="nav-file-title-content file-activity-title-content ${props.isOpenFile ? 'is-active' : ''}"
    draggable="true"
    onClick=${focusFile}
    onDragStart=${dragFile}
    onMouseOver=${hoverLink}
    onContextMenu=${contextMenu}
  >
    ${props.name}
  </div>
  `
}

function UnresolvedLink(props: ItemProps) {
  const searchFile = () => {
    if (props.app === undefined) { return; }
    // Is there a better way?
    window.location.href = `obsidian://search?vault=${props.app.vault.getName()}&query=[[${props.name}]]`
  }

  return html`
  <div 
    class="nav-file-title-content file-activity-title-content file-activity-unresolved"
    onClick=${() => searchFile()}
  >
    ${props.name}
  </div>
  `
}

export default class FileActivityListView extends ItemView {
  private readonly plugin: FileActivityPlugin;
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

    // Pass 
    // Janky because I've opted not to use JSX
    this.component = h(
      AppContext.Provider,
      {
        value: this.plugin.app, 
        children: h(FileActivity, {entries: this.displayEntries, config: this.config})
      },
    )

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
