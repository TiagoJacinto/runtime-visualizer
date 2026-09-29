import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo } from "react";

interface ProjectFileTreeProps {
  paths: readonly string[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export const ProjectFileTree = ({
  paths,
  selectedPath,
  onSelect,
}: ProjectFileTreeProps) => {
  const input = useMemo(() => [...paths], [paths]);
  const { model } = useFileTree({
    initialExpansion: "open",
    initialSelectedPaths: selectedPath === null ? [] : [selectedPath],
    onSelectionChange: (selected) => {
      const [path] = selected;
      if (path !== undefined) {
        onSelect(path);
      }
    },
    paths: input,
  });
  useEffect(() => {
    model.resetPaths(input);
    if (selectedPath !== null) {
      const item = model.getItem(selectedPath);
      if (item !== null && !item.isSelected()) {
        item.select();
      }
      model.focusPath(selectedPath);
    }
  }, [input, model, selectedPath]);
  return (
    <div className="min-h-28 border-b border-white/10 px-2 py-3">
      <p className="px-2 pb-2 text-[9px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        Project files
      </p>
      <FileTree model={model} style={{ height: "220px" }} />
    </div>
  );
};
