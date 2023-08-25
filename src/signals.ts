

import { DEFAULT_CONFIG, DisplayEntry, LinkKey, PluginConfig, ReverseIndex, getAllDisplayEntries } from "./data";

import { Signal, computed, effect, signal } from '@preact/signals';
import FileActivityPlugin from './main';


export async function setupConfigSignals(plugin: FileActivityPlugin) {
  console.log("loading config")
  const config = signal<PluginConfig>({...DEFAULT_CONFIG, ...await plugin.loadData()})
  effect(() => {
    // Ought to be async... return something to cancel this?
    console.log("saving config")
    plugin.saveData(config.value)
  })
  return config
}

/**
 * Set up the state update logic for the plugin display.
 * 
 * Returns a signal for the records to be displayed in the plugin,
 * which responds reactively to changes to config, or to the `dirty`
 * signal, whose value acts as a queue of records to synchronize to 
 * the frontend.
 */
export function setupStateSignals(
  index: ReverseIndex,
  update: Signal<number>,
  config: Signal<PluginConfig>
): Signal<DisplayEntry[]> {

  // TODO
  const today = signal(new Date().setHours(0, 0, 0, 0))
  // TODO: trigger rerender whenever active file changes, somehow.
  // const openFilePath = signal(app.workspace.getActiveFile()?.path)
  // currently just handled in the view 

  const regexes = computed(() => {
    return config.value.disallowedPaths
      .filter((path) => path.length > 0)
      .map((pattern) => new RegExp(pattern))}
  )

  // Initialize
  const displayEntries = signal<Record<LinkKey, DisplayEntry>>(
    getAllDisplayEntries(index, config.value, regexes.value)
  )

  effect(() => {
    console.log("updating all display entries")
    today.value; // subscribe
    update.value;
    displayEntries.value = getAllDisplayEntries(index, config.value, regexes.value)
  })


  // Updates whenever displayEntries is recomputed
  const topN: Signal<DisplayEntry[]> = computed(() => {
    console.log("computing top N display entries")
    // TODO: omit entries with no recent links? Or draw an empty line...
    return Object.values(displayEntries.value)
      .sort(((e1, e2) => e2.weight - e1.weight))  // Weight descending
      .slice(0, config.value.maxLength)
  })

  return topN
}