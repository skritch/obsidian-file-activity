import { PluginState, Link, remove, rename, update } from "../src/data"


describe("File Activity Plugin", () => {
  const TIME_T = 1692055220000
  
  const initialData = (): PluginState => {
    return {
      reverseIndex: {
        "target.md": {
          isResolved: true,
          text: "target",
          linksBySource: {"source.md": TIME_T}
        }
      }
    }
  };


  describe("update", () => {
    test("Handles adding links a file", () => {
      const data = {
        ...initialData(),
        reverseIndex: {
          ...initialData().reverseIndex,
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"source.md": TIME_T}
          },
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        reverseIndex: {
          "target.md": {
            text: "target",
            isResolved: true,
            linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
          },
          "otherTarget.md": {
            text: "otherTarget",
            isResolved: true,
            linksBySource: {"otherSource.md": TIME_T + 1}
          },
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
          },
          "anotherUnresolved": {
            text: "anotherUnresolved",
            isResolved: false,
            linksBySource: {"otherSource.md": TIME_T + 1}
          }
        }
      };
  
      // Sequence fired when adding a link to a file
      const newLinks: Link[] = [
        {path: "target.md", text: "target", isResolved: true},
        {path: "otherTarget.md", text: "otherTarget", isResolved: true},
        {text: "unresolved", isResolved: false},
        {text: "anotherUnresolved", isResolved: false}
      ]
      update("otherSource.md", TIME_T + 1, newLinks, data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing links from a file", () => {
      const data: PluginState = {
        ...initialData(),
        reverseIndex: {
          "target.md": {
            text: "target",
            isResolved: true,
            linksBySource: {"source.md": TIME_T}
          },
          "otherTarget.md": {
            text: "otherTarget",
            isResolved: true,
            linksBySource: {"source.md": TIME_T}
          },
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"source.md": TIME_T}
          },
          "anotherUnresolved": {
            text: "anotherUnresolved",
            isResolved: false,
            linksBySource: {"source.md": TIME_T}
          }
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        
        reverseIndex: {
          "target.md": {
            text: "target",
            isResolved: true,
            linksBySource: {"source.md": TIME_T + 1}
          },
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"source.md": TIME_T + 1}
          }
        }
      };
  
      // Sequence fired when adding a link to a file and then removing it
      const newLinks: Link[] = [
        {path: "target.md", text: "target", isResolved: true},
        {text: "unresolved", isResolved: false}
      ]
      update("source.md", TIME_T + 1, newLinks, data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing the last link to a file", () => {
      const data: PluginState = {
        ...initialData(),
        reverseIndex: {
          ...initialData().reverseIndex,
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"source.md": TIME_T}
          }
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        reverseIndex: {}
      };
  
      // Sequence fired when adding a link to a file and then removing it
      update("source.md", TIME_T + 1, [], data);
      
      expect(data).toEqual(finalData);
    });
  })


  describe("rename", () => {
    test("Handles renaming a file with both incoming and outgoing links", () => {
      const data: PluginState = {
        ...initialData(),
        reverseIndex: {
          ...initialData().reverseIndex,
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"target.md": TIME_T}
          },
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        reverseIndex: {
          "newTarget.md": {
            text: "newTarget",
            isResolved: true,
            linksBySource: {"source.md": TIME_T + 3}
          },
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"newTarget.md": TIME_T + 1}
          },
          "unresolved": {
            text: "unresolved",
            isResolved: false,
            linksBySource: {"newTarget.md": TIME_T + 1}
          }
        }
      };
  
      // Obsidian removes the old link, then renames, then adds the new link.
      update("source.md", TIME_T + 2, [], data);
      // Note earlier time--seems to happen in a weird order, but shouldn't make a difference.
      const renameLinks: Link[] = [
        {path: "other.md", text: "other", isResolved: true},
        {text: "unresolved", isResolved: false},
      ]
      rename("newTarget.md", "target.md", TIME_T + 1, renameLinks, data); 

      const updateLinks: Link[] = [
        {path: "newTarget.md", text: "newTarget", isResolved: true},
      ]
      update("source.md", TIME_T + 3, updateLinks, data);
      
      expect(data).toEqual(finalData);
    });

    test("Handles moving a file without changing its name", () => {
      const data: PluginState = {
        ...initialData(),
        reverseIndex: {
          ...initialData().reverseIndex,
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        reverseIndex: {
          "dir/target.md": {
            text: "target",
            isResolved: true,
            linksBySource: {"source.md": TIME_T + 2}
          },
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"dir/target.md": TIME_T + 1}
          }
        }
      };
  
      // Resolve for inbound links fires first.
      const updateLinks: Link[] = [
        {path: "dir/target.md", text: "target", isResolved: true},
      ]
      update("source.md", TIME_T + 2, updateLinks, data);

      const renameLinks: Link[] = [
        {path: "other.md", text: "other", isResolved: true},
      ]
      rename("dir/target.md", "target.md", TIME_T + 1, renameLinks, data);
      
      expect(data).toEqual(finalData);

    });
    
    // corner case? handle rename to same name as an existing file but at a new path
  })
  
  describe("delete", () => {
    test("Handles deleting a file with incoming and outgoing links", () => {
      const data: PluginState = {
        ...initialData(),
        reverseIndex: {
          ...initialData().reverseIndex,
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"source.md": TIME_T, "target.md": TIME_T}
          },
          "other": {
            text: "other",
            isResolved: false,
            linksBySource: {"target.md": TIME_T}
          }
        }
      }
      const finalData: PluginState = {
        ...initialData(),
        reverseIndex: {
          "other.md": {
            text: "other",
            isResolved: true,
            linksBySource: {"source.md": TIME_T + 1}
          },
          "target": {
            text: "target",
            isResolved: false,
            linksBySource: {"source.md": TIME_T + 1}
          }
        }
      };
  
      // Obsidian deletes the file, and fires separate events to unresolve incoming links.
      remove("target.md", data)

      const newLinks: Link[] = [
        {path: "other.md", text: "other", isResolved: true},
        {text: "target", isResolved: false},
      ]
      update("source.md", TIME_T + 1, newLinks, data);
      
      expect(data).toEqual(finalData);
    });
  });

  /**
   * Cases to test:
   *  app start
   *  - multiple resolves
   *  - resolved
   * 
   *  plugin enable (first time)
   *  - what happens?
   * 
   *  plugin disable + enable
   */
});
