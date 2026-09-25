import type { ProjectId, SavedProject } from "../../../../modules/project-files/index.ts";

export interface ProjectNavigationProps {
  readonly projects: readonly SavedProject[];
  readonly activeProjectId: ProjectId;
  readonly onSelectProject: (projectId: ProjectId) => void;
  readonly onAddProject: () => void;
}

export const ProjectSwitcher = ({
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
}: ProjectNavigationProps) => (
  <div className="space-y-2 border-b border-white/10 p-3">
    <label className="block space-y-1">
      <span className="px-1 text-[9px] font-medium tracking-[0.16em] text-slate-500 uppercase">
        Project
      </span>
      <select
        aria-label="Project"
        className="w-full rounded-lg border border-white/10 bg-[#07110E] px-3 py-2 text-xs text-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-200"
        value={activeProjectId}
        onChange={(event) => onSelectProject(event.currentTarget.value)}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
    <button
      type="button"
      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-200"
      onClick={onAddProject}
    >
      Add project folder
    </button>
  </div>
);
