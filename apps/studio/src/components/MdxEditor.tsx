import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useImperativeHandle,
  type Ref,
} from 'react';
import * as Icons from 'lucide-react';

/**
 * The editor's half of the scroll sync. Line numbers are the shared currency
 * between the two panes, and only the editor knows how tall each of its lines
 * ended up once the text wrapped, so the conversion belongs here.
 */
export interface MdxEditorHandle {
  /** The source line, possibly fractional, currently at the top of the view. */
  topVisibleLine(): number;
  /** Scroll so that `line` sits at the top of the view. */
  scrollToLine(line: number): void;
}

interface MdxEditorProps {
  value: string;
  onChange: (value: string) => void;
  onInsertSnippet?: (snippet: string) => void;
  isSaving?: boolean;
  onManualSave?: () => void;
  ref?: Ref<MdxEditorHandle>;
  /** Fired when the reader scrolls the editor, with the line now at the top. */
  onScrollLine?: (line: number) => void;
}

export function MdxEditor({
  value,
  onChange,
  isSaving = false,
  onManualSave,
  ref,
  onScrollLine,
}: MdxEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const snippetsButtonRef = useRef<HTMLButtonElement>(null);
  const snippetsMenuRef = useRef<HTMLDivElement>(null);
  const [showSnippetsMenu, setShowSnippetsMenu] = useState(false);
  const [snippetsMenuAnchor, setSnippetsMenuAnchor] = useState<{ top: number; left: number } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // How tall each logical line renders inside the textarea, measured from the
  // mirror below. Empty until the first layout pass.
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  // The same measurements, reachable from an event handler without making the
  // scroll sync a dependency of every render that changes them.
  const lineHeightsRef = useRef<number[]>([]);
  lineHeightsRef.current = lineHeights;

  // Fallback for lines the mirror has not measured yet, read from the textarea
  // rather than hard-coded so it cannot drift from the stylesheet.
  const uniformLineHeightRef = useRef(24);

  // Undo / Redo History Stack
  const [history, setHistory] = useState<string[]>([value]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isUndoRedoAction = useRef(false);

  // Line count for editor line numbers sidebar
  const lines = value.split('\n');
  const lineCount = lines.length;

  /**
   * The gutter is a sibling of the textarea, so nothing moves it when the text
   * scrolls. Only the textarea drives this, and only when the two differ: the
   * gutter's own scroll event is never listened to, so there is no way for the
   * two to push each other.
   */
  const syncGutterScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !gutter) return;
    if (gutter.scrollTop !== textarea.scrollTop) gutter.scrollTop = textarea.scrollTop;
  }, []);

  /** Height of one logical line, measured where the mirror has been laid out. */
  const heightOfLine = useCallback(
    (index: number) => lineHeightsRef.current[index] || uniformLineHeightRef.current,
    []
  );

  /** Distance from the top of the text to the start of `line`, one-based. */
  const offsetOfLine = useCallback(
    (line: number) => {
      const whole = Math.max(0, Math.floor(line) - 1);
      let top = 0;
      for (let index = 0; index < whole; index += 1) top += heightOfLine(index);
      // A fractional line comes from interpolating between two headings; carry
      // the fraction through so the two panes do not step in whole lines.
      return top + (line - Math.floor(line)) * heightOfLine(whole);
    },
    [heightOfLine]
  );

  /** The inverse: which line, possibly fractional, starts at `offset`. */
  const lineAtOffset = useCallback(
    (offset: number) => {
      if (offset <= 0) return 1;
      let top = 0;
      const count = Math.max(1, lineHeightsRef.current.length);
      for (let index = 0; index < count; index += 1) {
        const height = heightOfLine(index);
        if (top + height > offset) return index + 1 + (offset - top) / height;
        top += height;
      }
      return count;
    },
    [heightOfLine]
  );

  useImperativeHandle(
    ref,
    () => ({
      topVisibleLine: () => lineAtOffset(textareaRef.current?.scrollTop ?? 0),
      scrollToLine: (line: number) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const target = offsetOfLine(line);
        if (Math.abs(target - textarea.scrollTop) < 2) return;
        textarea.scrollTop = target;
        syncGutterScroll();
      },
    }),
    [lineAtOffset, offsetOfLine, syncGutterScroll]
  );

  /**
   * A soft-wrapped line fills more than one row of the textarea, so a gutter
   * that gives every line the same height slides out of step with the text -
   * gradually, and worst at the bottom of a long document - even once the two
   * scroll together. The mirror lays the same lines out in the textarea's own
   * content box, which is the only way to find out how tall each one really is.
   */
  useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    const textarea = textareaRef.current;
    if (!mirror || !textarea) return;

    const measure = () => {
      const declared = parseFloat(window.getComputedStyle(textarea).lineHeight);
      if (Number.isFinite(declared) && declared > 0) uniformLineHeightRef.current = declared;

      // clientWidth excludes the scrollbar, so the mirror wraps where the text does.
      mirror.style.width = `${textarea.clientWidth}px`;
      const heights = Array.from(mirror.children, (row) => (row as HTMLElement).offsetHeight);
      setLineHeights((current) =>
        current.length === heights.length && current.every((height, i) => height === heights[i])
          ? current
          : heights
      );
      syncGutterScroll();
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [value, syncGutterScroll]);

  /**
   * The toolbar strip scrolls sideways, and a box that scrolls in one axis
   * clips the other one too, so a menu hanging below the button was cut off at
   * the strip's own 34px and nothing of it was ever visible. The menu is
   * positioned against the viewport instead, measured from the button, which
   * also keeps it under the button when the strip itself has been scrolled.
   */
  const positionSnippetsMenu = useCallback(() => {
    const button = snippetsButtonRef.current;
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const MENU_WIDTH = 256;
    const MARGIN = 8;
    setSnippetsMenuAnchor({
      top: bounds.bottom + 4,
      left: Math.max(MARGIN, Math.min(bounds.left, window.innerWidth - MENU_WIDTH - MARGIN)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!showSnippetsMenu) return;
    positionSnippetsMenu();

    // A viewport-positioned menu does not travel with the button, so anything
    // that could move the button has to close the gap again.
    const reposition = () => positionSnippetsMenu();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showSnippetsMenu, positionSnippetsMenu]);

  // Picking an item closes the menu; so should clicking anywhere else, or Escape.
  useEffect(() => {
    if (!showSnippetsMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (snippetsMenuRef.current?.contains(target)) return;
      if (snippetsButtonRef.current?.contains(target)) return;
      setShowSnippetsMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSnippetsMenu(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showSnippetsMenu]);

  // Sync value changes to history stack when user types or inserts text
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    if (value !== history[historyIndex]) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(value);
      // Cap history at 100 entries
      if (newHistory.length > 100) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [value]);

  /**
   * The textarea is controlled, so any render that hands it a value the DOM does
   * not already hold makes React reassign `textarea.value` - and assigning a
   * textarea's value drops the caret at the end of the text. An undo, a snippet
   * insertion and a document refreshed underneath the editor all change the
   * value for reasons that have nothing to do with where the user is typing, so
   * the caret has to be put back afterwards.
   *
   * `typedValueRef` is what the user's own keystroke produced. When the incoming
   * value is that exact string the browser has already left the caret in the
   * right place and touching it would fight the person typing. It is cleared as
   * soon as it has been used, so that redoing back to a string the user once
   * typed still counts as a change the editor made rather than the user.
   */
  const lastValueRef = useRef(value);
  const typedValueRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const previous = lastValueRef.current;
    const typed = typedValueRef.current;
    lastValueRef.current = value;
    typedValueRef.current = null;
    if (!textarea || previous === value || typed === value) return;

    // The end of the run of text that actually changed. For an undone insertion
    // that is where the removed characters were; for an inserted snippet it is
    // the far side of what was just added - in both cases where the user is
    // looking, rather than the end of the document.
    let prefix = 0;
    while (prefix < previous.length && prefix < value.length && previous[prefix] === value[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < previous.length - prefix &&
      suffix < value.length - prefix &&
      previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    const caret = value.length - suffix;
    textarea.setSelectionRange(caret, caret);
  }, [value]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const targetVal = history[historyIndex - 1];
      isUndoRedoAction.current = true;
      setHistoryIndex(historyIndex - 1);
      onChange(targetVal);
    }
  }, [historyIndex, history, onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const targetVal = history[historyIndex + 1];
      isUndoRedoAction.current = true;
      setHistoryIndex(historyIndex + 1);
      onChange(targetVal);
    }
  }, [historyIndex, history, onChange]);

  // Insert snippet at current cursor position
  const insertAtCursor = (textToInsert: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + textToInsert + value.substring(end);

    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
    }, 0);
  };

  // Keyboard shortcuts handling
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    } else if (modifier && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
    } else if (modifier && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (onManualSave) onManualSave();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCursor('  ');
    }
  };

  const snippets = [
    { label: 'Frontmatter Banner', snippet: '---\ntitle: "My MDX Page"\ndescription: "Page overview..."\nauthor: "Alex Morgan"\ndate: "2026-08-01"\ntags: ["MDX", "React"]\n---\n\n' },
    { label: '<Callout>', snippet: '\n<Callout type="info" title="Note Title">\n  Enter callout body text here...\n</Callout>\n' },
    { label: '<CardGrid> & <Card>', snippet: '\n<CardGrid cols={2}>\n  <Card title="Feature 1" subtitle="Subtitle" icon="Zap" badge="New">\n    Description of feature 1...\n  </Card>\n  <Card title="Feature 2" subtitle="Subtitle" icon="Shield">\n    Description of feature 2...\n  </Card>\n</CardGrid>\n' },
    { label: '<StatGrid> & <Stat>', snippet: '\n<StatGrid cols={3}>\n  <Stat title="Total Sales" value="$24,500" change="+12.5%" trend="up" icon="DollarSign" />\n  <Stat title="Active Users" value="1,820" change="+8.1%" trend="up" icon="Users" />\n  <Stat title="Bounce Rate" value="2.4%" change="-0.5%" trend="down" icon="Activity" />\n</StatGrid>\n' },
    { label: '<Chart>', snippet: '\n<Chart \n  type="area"\n  title="Growth Analytics"\n  data={[\n    { name: "Jan", value: 100 },\n    { name: "Feb", value: 300 },\n    { name: "Mar", value: 500 }\n  ]}\n/>\n' },
    { label: '<Tabs>', snippet: '\n<Tabs labels={["Tab 1", "Tab 2"]}>\n  <Tab title="Tab 1">\n    Content for Tab 1...\n  </Tab>\n  <Tab title="Tab 2">\n    Content for Tab 2...\n  </Tab>\n</Tabs>\n' },
    { label: '<InteractiveCounter>', snippet: '\n<InteractiveCounter initial={10} min={0} max={100} step={1} title="Interactive Counter" />\n' },
    { label: '<Accordion>', snippet: '\n<Accordion items={[\n  { title: "FAQ Question 1", content: "Answer to question 1..." },\n  { title: "FAQ Question 2", content: "Answer to question 2..." }\n]} />\n' },
    { label: 'Code Block', snippet: '\n```typescript\nfunction helloMDX() {\n  console.log("Hello from MDX!");\n}\n```\n' },
  ];

  // No right border on the shell: in the split view the divider beside it is the
  // seam, and a second line next to that one reads as a mistake.
  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 mdx-editor-container no-print">
      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950 border-b border-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              canUndo
                ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                : 'text-slate-600 opacity-40 cursor-not-allowed'
            }`}
          >
            <Icons.Undo2 className="w-4 h-4" />
          </button>

          {/* Redo Button */}
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              canRedo
                ? 'text-slate-300 hover:text-white hover:bg-slate-800'
                : 'text-slate-600 opacity-40 cursor-not-allowed'
            }`}
          >
            <Icons.Redo2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 my-auto mx-1" />

          {/* Formatting Controls */}
          <button
            onClick={() => insertAtCursor('**bold text**')}
            title="Bold"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertAtCursor('*italic text*')}
            title="Italic"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertAtCursor('\n# Heading 1\n')}
            title="Heading 1"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-bold transition-colors cursor-pointer"
          >
            H1
          </button>
          <button
            onClick={() => insertAtCursor('\n## Heading 2\n')}
            title="Heading 2"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 font-semibold transition-colors cursor-pointer"
          >
            H2
          </button>
          <button
            onClick={() => insertAtCursor('[Link Text](https://example.com)')}
            title="Link"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.Link className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertAtCursor('`inline code`')}
            title="Inline Code"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.Code className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertAtCursor('\n- Item 1\n- Item 2\n')}
            title="Bullet List"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.List className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertAtCursor('\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n')}
            title="Table"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Icons.Table className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 my-auto mx-1" />

          {/* Insert Custom Component Snippet Dropdown */}
          <div className="relative">
            <button
              ref={snippetsButtonRef}
              onClick={() => setShowSnippetsMenu(!showSnippetsMenu)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 border border-indigo-500/30 font-medium transition-colors cursor-pointer"
            >
              <Icons.PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Insert Component</span>
              <Icons.ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showSnippetsMenu && snippetsMenuAnchor && (
              <div
                ref={snippetsMenuRef}
                className="fixed z-50 w-64 max-h-[70vh] overflow-y-auto custom-scrollbar bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 text-xs"
                style={{ top: snippetsMenuAnchor.top, left: snippetsMenuAnchor.left }}
                onClick={() => setShowSnippetsMenu(false)}
              >
                <div className="px-3 py-1.5 font-semibold text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                  Custom MDX Snippets
                </div>
                {snippets.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => insertAtCursor(item.snippet)}
                    className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{item.label}</span>
                    <Icons.Plus className="w-3 h-3 text-slate-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Controls: Auto-save status, Search, Line Count */}
        <div className="flex items-center gap-2">
          {/* Auto Save Status Badge */}
          <button
            onClick={() => onManualSave && onManualSave()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-medium text-slate-300 hover:border-slate-700 transition-colors cursor-pointer"
            title="Auto-save enabled (Click or Ctrl+S to save now)"
          >
            {isSaving ? (
              <>
                <Icons.Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
                <span className="text-indigo-300">Saving...</span>
              </>
            ) : (
              <>
                <Icons.CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">Auto-saved</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Find in editor"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showSearch ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icons.Search className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </div>
      </div>

      {/* Optional Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-2 p-2 bg-slate-950 border-b border-slate-800 text-xs">
          <Icons.Search className="w-3.5 h-3.5 text-slate-500 ml-1" />
          <input
            type="text"
            placeholder="Search text in editor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-slate-900 text-slate-200 px-2 py-1 rounded border border-slate-800 focus:outline-hidden focus:border-indigo-500 text-xs font-mono"
          />
          {searchQuery && (
            <span className="text-[10px] text-slate-400">
              {value.split(searchQuery).length - 1} matches
            </span>
          )}
          <button
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            className="text-slate-400 hover:text-white p-1"
          >
            <Icons.X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Text Area with Line Numbers */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Line Numbers Column */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="w-10 shrink-0 select-none bg-slate-950/80 border-r border-slate-800/60 py-3 text-right pr-2 text-[11px] font-mono text-slate-600 leading-6 overflow-hidden"
        >
          {Array.from({ length: Math.max(1, lineCount) }).map((_, i) => (
            <div key={i} style={lineHeights[i] ? { height: lineHeights[i] } : undefined}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            typedValueRef.current = e.target.value;
            onChange(e.target.value);
          }}
          onScroll={(e) => {
            syncGutterScroll();
            onScrollLine?.(lineAtOffset(e.currentTarget.scrollTop));
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type or paste MDX content here..."
          spellCheck={false}
          className="flex-1 h-full w-full bg-slate-900 text-slate-100 p-3 font-mono text-xs leading-6 resize-none focus:outline-hidden custom-scrollbar"
        />

        {/*
          The textarea's own layout, laid out again where it can be measured. It
          carries the textarea's padding, font and wrapping rules so each child's
          height is the height that line takes up in the editor; it is hidden
          rather than removed because only a laid-out box has a height.
        */}
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className="invisible pointer-events-none absolute top-0 left-0 -z-10 p-3 font-mono text-xs leading-6 whitespace-pre-wrap break-words"
        >
          {lines.map((line, i) => (
            // A blank line still occupies a row, but an empty box has no height,
            // so it gets a zero-width space to stand on.
            <div key={i}>{line === '' ? '\u200b' : line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
