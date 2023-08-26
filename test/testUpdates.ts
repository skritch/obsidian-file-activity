import { Link, ReverseIndex, remove, rename, update } from "../src/data";


describe("File Activity Plugin", () => {
  const TIME_T = 1692055220000
  
  describe("update", () => {
    test("Handles adding links a file", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"source.md": TIME_T}
        }
      }
      const finalData: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
        },
        "otherTarget.md": {
          link: {isResolved: true, path: "otherTarget.md"},
          linksBySource: {"otherSource.md": TIME_T + 1}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"otherSource.md": TIME_T + 1, "source.md": TIME_T}
        },
        "anotherUnresolved": {
          link: {isResolved: false, text: "anotherUnresolved"},
          linksBySource: {"otherSource.md": TIME_T + 1}
        }
      };
  
      // Sequence fired when adding a link to a file
      const newLinks: Link[] = [
        {path: "target.md", isResolved: true},
        {path: "otherTarget.md", isResolved: true},
        {text: "unresolved", isResolved: false},
        {text: "anotherUnresolved", isResolved: false}
      ]
      update("otherSource.md", TIME_T + 1, newLinks, data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing links from a file", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "otherTarget.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"source.md": TIME_T}
        },
        "anotherUnresolved": {
          link: {isResolved: false, text: "anotherUnresolved"},
          linksBySource: {"source.md": TIME_T}
        }
      }
      const finalData: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T + 1}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"source.md": TIME_T + 1}
        }
      };
  
      // Sequence fired when adding a link to a file and then removing it
      const newLinks: Link[] = [
        {path: "target.md", isResolved: true},
        {text: "unresolved", isResolved: false}
      ]
      update("source.md", TIME_T + 1, newLinks, data);
      
      expect(data).toEqual(finalData);
    });
  
    test("Handles removing the last link to a file", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"source.md": TIME_T}
        }
      }
      const finalData: ReverseIndex = {};
  
      // Sequence fired when adding a link to a file and then removing it
      update("source.md", TIME_T + 1, [], data);
      
      expect(data).toEqual(finalData);
    });
  })


  describe("rename", () => {
    test("Handles renaming a file with both incoming and outgoing links", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"target.md": TIME_T}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"target.md": TIME_T}
        }
      }
      const finalData: ReverseIndex = {
        "newTarget.md": {
          link: {isResolved: true, path: "newTarget.md"},
          linksBySource: {"source.md": TIME_T + 3}
        },
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"newTarget.md": TIME_T + 1}
        },
        "unresolved": {
          link: {isResolved: false, text: "unresolved"},
          linksBySource: {"newTarget.md": TIME_T + 1}
        }
      };
  
      // Obsidian removes the old link, then renames, then adds the new link.
      update("source.md", TIME_T + 2, [], data);
      // Note earlier time--seems to happen in a weird order, but shouldn't make a difference.
      const renameLinks: Link[] = [
        {path: "other.md", isResolved: true},
        {text: "unresolved", isResolved: false},
      ]
      rename("newTarget.md", "target.md", TIME_T + 1, renameLinks, data); 

      const updateLinks: Link[] = [
        {path: "newTarget.md", isResolved: true},
      ]
      update("source.md", TIME_T + 3, updateLinks, data);
      
      expect(data).toEqual(finalData);
    });

    test("Handles moving a file without changing its name", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"target.md": TIME_T}
        }
      }
      
      // Resolve for inbound links fires first.
      const updateLinks: Link[] = [
        {path: "dir/target.md", isResolved: true},
      ]
      update("source.md", TIME_T + 2, updateLinks, data);

      const renameLinks: Link[] = [
        {path: "other.md", isResolved: true},
      ]
      rename("dir/target.md", "target.md", TIME_T + 1, renameLinks, data);

      const finalData: ReverseIndex = {
        "dir/target.md": {
          link: {isResolved: true, path: "dir/target.md"},
          linksBySource: {"source.md": TIME_T + 2}
        },
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"dir/target.md": TIME_T + 1}
        }
      };
      
      expect(data).toEqual(finalData);

    });
    
    // corner case? handle rename to same name as an existing file but at a new path
  })
  
  describe("delete", () => {
    test("Handles deleting a file with incoming and outgoing links", () => {
      const data: ReverseIndex = {
        "target.md": {
          link: {isResolved: true, path: "target.md"},
          linksBySource: {"source.md": TIME_T}
        },
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"source.md": TIME_T, "target.md": TIME_T}
        },
        "other": {
          link: {isResolved: false, text: "other"},
          linksBySource: {"target.md": TIME_T}
        }
      }
      const finalData: ReverseIndex = {
        "other.md": {
          link: {isResolved: true, path: "other.md"},
          linksBySource: {"source.md": TIME_T + 1}
        },
        "target": {
          link: {isResolved: false, text: "target"},
          linksBySource: {"source.md": TIME_T + 1}
        }
      };
  
      // Obsidian deletes the file, and fires separate events to unresolve incoming links.
      remove("target.md", data)

      const newLinks: Link[] = [
        {path: "other.md", isResolved: true},
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
