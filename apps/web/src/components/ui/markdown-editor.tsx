import { useEffect, useState } from 'react';
import { BlockquotePlugin, BoldPlugin, H1Plugin, H2Plugin, H3Plugin, ItalicPlugin, UnderlinePlugin } from '@platejs/basic-nodes/react';
import { BulletedListPlugin, ListItemPlugin, ListPlugin, NumberedListPlugin } from '@platejs/list-classic/react';
import { MarkdownPlugin } from '@platejs/markdown';
import { List, ListOrdered, Quote, Redo2, Undo2 } from 'lucide-react';
import { Plate, PlateContent, PlateElement, PlateLeaf, type PlateElementProps, type PlateLeafProps, usePlateEditor } from 'platejs/react';
import { Editor as SlateEditor, Element as SlateElement } from 'slate';
import { Button } from '@/components/ui/button';

type MarkdownEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
};

function H1Element(props: PlateElementProps) {
  return <PlateElement as="h1" className="text-3xl font-semibold leading-tight my-2" {...props} />;
}

function H2Element(props: PlateElementProps) {
  return <PlateElement as="h2" className="text-2xl font-semibold leading-tight my-2" {...props} />;
}

function H3Element(props: PlateElementProps) {
  return <PlateElement as="h3" className="text-xl font-semibold leading-tight my-2" {...props} />;
}

function BlockquoteElement(props: PlateElementProps) {
  return <PlateElement as="blockquote" className="border-l-2 pl-4 my-2 italic text-muted-foreground" {...props} />;
}

function BulletedListElement(props: PlateElementProps) {
  return <PlateElement as="ul" className="list-disc pl-6 my-2" {...props} />;
}

function NumberedListElement(props: PlateElementProps) {
  return <PlateElement as="ol" className="list-decimal pl-6 my-2" {...props} />;
}

function ListItemElement(props: PlateElementProps) {
  return <PlateElement as="li" className="my-1" {...props} />;
}

function BoldLeaf(props: PlateLeafProps) {
  return <PlateLeaf as="strong" className="font-semibold" {...props} />;
}

function ItalicLeaf(props: PlateLeafProps) {
  return <PlateLeaf as="em" className="italic" {...props} />;
}

function UnderlineLeaf(props: PlateLeafProps) {
  return <PlateLeaf as="u" className="underline" {...props} />;
}

export function MarkdownEditor({ markdown, onChange, placeholder = 'Write content…' }: MarkdownEditorProps) {
  const editor = usePlateEditor({
    plugins: [
      BoldPlugin.withComponent(BoldLeaf),
      ItalicPlugin.withComponent(ItalicLeaf),
      UnderlinePlugin.withComponent(UnderlineLeaf),
      H1Plugin.withComponent(H1Element),
      H2Plugin.withComponent(H2Element),
      H3Plugin.withComponent(H3Element),
      BlockquotePlugin.withComponent(BlockquoteElement),
      ListPlugin,
      BulletedListPlugin.withComponent(BulletedListElement),
      NumberedListPlugin.withComponent(NumberedListElement),
      ListItemPlugin.withComponent(ListItemElement),
      MarkdownPlugin,
    ],
    value: (ed) => ed.getApi(MarkdownPlugin).markdown.deserialize(markdown || ''),
  }) as any;
  const [toolbarState, setToolbarState] = useState({
    h1: false,
    h2: false,
    blockquote: false,
    ul: false,
    ol: false,
    bold: false,
    italic: false,
    underline: false,
  });

  if (!editor) return null;

  function computeToolbarState() {
    try {
      const marks = (SlateEditor.marks(editor) ?? {}) as Record<string, unknown>;
      const hasBlock = (type: string) =>
        !!Array.from(
          SlateEditor.nodes(editor, {
            match: (node) => SlateElement.isElement(node) && (node as { type?: string }).type === type,
          }),
        )[0];

      setToolbarState({
        h1: hasBlock('h1'),
        h2: hasBlock('h2'),
        blockquote: hasBlock('blockquote'),
        ul: hasBlock('ul'),
        ol: hasBlock('ol'),
        bold: Boolean(marks.bold),
        italic: Boolean(marks.italic),
        underline: Boolean(marks.underline),
      });
    } catch {
      setToolbarState((prev) => prev);
    }
  }

  useEffect(() => {
    const currentMarkdown = editor.getApi(MarkdownPlugin).markdown.serialize();
    if (currentMarkdown === markdown) return;
    editor.tf.setValue(editor.getApi(MarkdownPlugin).markdown.deserialize(markdown || ''));
    computeToolbarState();
  }, [editor, markdown]);

  return (
    <div className="rounded-md border bg-background">
      <Plate
        editor={editor}
        onChange={() => {
          onChange(editor.getApi(MarkdownPlugin).markdown.serialize());
          computeToolbarState();
        }}
      >
        <div className="flex items-center gap-2 border-b p-2">
          <Button type="button" variant="outline" size="sm" onClick={() => editor.tf.undo()}>
            <Undo2 />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => editor.tf.redo()}>
            <Redo2 />
          </Button>
          <Button type="button" variant={toolbarState.h1 ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.h1} onClick={() => editor.tf.h1.toggle()}>
            H1
          </Button>
          <Button type="button" variant={toolbarState.h2 ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.h2} onClick={() => editor.tf.h2.toggle()}>
            H2
          </Button>
          <Button type="button" variant={toolbarState.blockquote ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.blockquote} onClick={() => editor.tf.blockquote.toggle()}>
            <Quote />
          </Button>
          <Button type="button" variant={toolbarState.ul ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.ul} onClick={() => editor.tf.ul.toggle()}>
            <List />
          </Button>
          <Button type="button" variant={toolbarState.ol ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.ol} onClick={() => editor.tf.ol.toggle()}>
            <ListOrdered />
          </Button>
          <Button type="button" variant={toolbarState.bold ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.bold} onClick={() => editor.tf.toggleMark('bold')}>
            B
          </Button>
          <Button type="button" variant={toolbarState.italic ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.italic} onClick={() => editor.tf.toggleMark('italic')}>
            I
          </Button>
          <Button type="button" variant={toolbarState.underline ? 'default' : 'outline'} size="sm" aria-pressed={toolbarState.underline} onClick={() => editor.tf.toggleMark('underline')}>
            U
          </Button>
        </div>
        <PlateContent placeholder={placeholder} className="min-h-40 px-3 py-3 text-sm" />
      </Plate>
    </div>
  );
}
