// Value-taking flags from the pinned Oxlint CLI. Preserve option order and consume
// their values before classifying file targets; `--` ends option parsing.
const valueOptions = new Set([
  '-c',
  '--config',
  '--tsconfig',
  '-A',
  '--allow',
  '-W',
  '--warn',
  '-D',
  '--deny',
  '--ignore-path',
  '--ignore-pattern',
  '--max-warnings',
  '-f',
  '--format',
  '--debug',
  '--threads',
  '--report-unused-disable-directives-severity',
]);

export const splitLintArgs = (args: string[]) => {
  const options: string[] = [];
  const targets: string[] = [];
  let positional = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (positional || !arg.startsWith('-') || arg === '-') {
      targets.push(arg);
    } else if (arg === '--') {
      positional = true;
    } else {
      options.push(arg);
      if (valueOptions.has(arg)) {
        const value = args[index + 1];
        if (value === undefined || value.startsWith('-')) {
          throw new Error(
            `${arg} requires a value; use ${arg}=VALUE for a value starting with '-'.`,
          );
        }
        options.push(value);
        index += 1;
      }
    }
  }
  return { options, targets };
};
