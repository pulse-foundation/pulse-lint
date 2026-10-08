import fs from 'node:fs';
import path from 'node:path';

// Files are attributed to the nearest package.json, including nested unconfigured packages.
type Project = { projectRoot: string; preset: 'native' | 'server' };

const readPreset = (packageJsonPath: string): string | null => {
  try {
    const value = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      pulseLint?: { preset?: string };
    };
    return value.pulseLint?.preset ?? null;
  } catch {
    return null;
  }
};

const findProject = (absolutePath: string, cache: Map<string, Project | null>): Project | null => {
  let dir = path.dirname(absolutePath);
  const visited = [];
  let result: Project | null = null;
  while (true) {
    if (cache.has(dir)) {
      result = cache.get(dir) ?? null;
      break;
    }
    visited.push(dir);
    const packageJsonPath = path.join(dir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const preset = readPreset(packageJsonPath);
      result = preset === 'native' || preset === 'server' ? { projectRoot: dir, preset } : null;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const visitedDir of visited) cache.set(visitedDir, result);
  return result;
};

/**
 * Split explicit files between configured server/native projects and web. Directory targets
 * and files whose nearest package has no supported preset stay with web for compatibility.
 */
export const partitionLintTargets = (targets: string[], cwd: string) => {
  const cache = new Map<string, Project | null>();
  const webTargets: string[] = [];
  const groups = new Map<string, Project & { files: string[] }>();

  for (const target of targets) {
    const absolutePath = path.resolve(cwd, target);
    const isFile = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    const project = isFile ? findProject(absolutePath, cache) : null;
    if (!project) {
      webTargets.push(target);
      continue;
    }
    const group = groups.get(project.projectRoot) ?? { ...project, files: [] };
    group.files.push(absolutePath);
    groups.set(project.projectRoot, group);
  }

  return {
    webTargets,
    nativeGroups: [...groups.values()]
      .filter(({ preset }) => preset === 'native')
      .map(({ projectRoot, files }) => {
        return { projectRoot, files };
      }),
    serverGroups: [...groups.values()]
      .filter(({ preset }) => preset === 'server')
      .map(({ projectRoot, files }) => {
        return { projectRoot, files };
      }),
  };
};
