const fs = require('fs');
const path = require('path');

const projectRoot = 'C:\\Users\\JABS\\OneDrive\\Documents\\STATSPEAK PROJECTS\\B2C APP';

const files = [
  { file: 'drizzle/schema.ts', replacements: [['pgTable("pipelineRuns"', 'pgTable("pipeline_runs"'], ['pgTable("scheduledJobs"', 'pgTable("scheduled_jobs"']] },
  { file: 'server/db.ts', replacements: [['pipelineRuns', 'pipeline_runs'], ['scheduledJobs', 'scheduled_jobs']] },
  { file: 'server/_core/index.ts', replacements: [['pipelineRuns', 'pipeline_runs']] },
  { file: 'server/pipeline.ts', replacements: [['pipelineRuns', 'pipeline_runs']] },
];

for (const { file, replacements } of files) {
  const fullPath = path.join(projectRoot, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const [oldStr, newStr] of replacements) {
    content = content.split(oldStr).join(newStr);
  }
  fs.writeFileSync(fullPath, content);
  console.log('Updated:', file);
}
