import path from 'node:path';
import { pathToFileURL } from 'node:url';
const SKILL_DIR='C:/Users/saujh/.codex/plugins/cache/openai-primary-runtime/presentations/26.1026.10807/skills/presentations';
const workspaceDir='C:/Users/saujh/Downloads/split-up-main 2';
const {finalizePresentation}=await import(pathToFileURL(path.join(SKILL_DIR,'container_tools/artifact_tool_utils.mjs')).href);
const result=await finalizePresentation({
 workspaceDir,
 candidatePath:path.join(workspaceDir,'.build/draft.pptx'),
 finalPath:path.join(workspaceDir,'output/Split-Up-Product-Overview.pptx'),
 pythonExecutable:'C:/Users/saujh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
 integrityValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(SKILL_DIR,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
 explicitTotalSlideCount:9,
 requiredNativeTableOwnerSlides:[],
 requiredNativeChartOwnerSlides:[],
 verifyArtifactToolImport:true,
 receiptPath:path.join(workspaceDir,'.build/validation.json')
});
console.log(JSON.stringify(result));
