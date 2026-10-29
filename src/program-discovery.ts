import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const execFileAsync=promisify(execFile);

export type SupportedProgram = "clipstudio" | "blender" | "unity" | "godot" | "roblox" | "monogame";
export interface ProgramProbe { name: string; path: string; commandLine: string }
export interface ProgramInspection {
  provider: SupportedProgram;
  processes: Array<{name:string;path:string}>;
  installedExecutablePaths: string[];
  connectionCandidates: Array<Record<string,string|number>>;
  instructions: string;
}

const processNames: Record<SupportedProgram,string[]> = {
  clipstudio:["CLIPStudioPaint.exe"],
  blender:["blender.exe"],
  unity:["Unity.exe","Unity Hub.exe"],
  godot:["godot.exe","Godot_v4.exe","Godot_v4.7.exe","godot_mono.exe"],
  roblox:["RobloxStudioBeta.exe","RobloxStudio.exe"],
  monogame:["dotnet.exe"]
};
const productNames:Record<SupportedProgram,string> = {
  clipstudio:"CLIP STUDIO", blender:"Blender", unity:"Unity",
  godot:"Godot", roblox:"Roblox Studio", monogame:"MonoGame"
};

export function parseProgramProbe(raw:string):ProgramProbe[] {
  if (!raw.trim())return [];
  const decoded=JSON.parse(raw) as unknown;
  const records=Array.isArray(decoded)?decoded:[decoded];
  const seen=new Set<string>();
  const output:ProgramProbe[]=[];
  for (const obj of records.slice(0,150)) {
    if (!obj||typeof obj!=="object")continue;
    const r=obj as Record<string,unknown>;
    const name=String(r.name??r.Name??"");
    const path=String(r.path??r.ExecutablePath??"");
    const commandLine=String(r.commandLine??r.CommandLine??"");
    if (!name)continue;
    const key=[name.toLowerCase(),path.toLowerCase(),commandLine].join("|");
    if (seen.has(key))continue;
    seen.add(key);output.push({name,path,commandLine});
  }
  return output;
}

export function chooseAutoDetectedSettings(
  provider:SupportedProgram,
  processes:ProgramProbe[],
  hints:{bridgePort?:number; knownProjectRoot?:string; installed?:boolean}
):Record<string,string|number> {
  const active=processes.some(x=>processNames[provider].some(n=>
    x.name.toLowerCase()===n.toLowerCase() ||
    (provider==="godot" && /^godot.*\.exe$/i.test(x.name))
  ));
  if (provider==="unity"||provider==="roblox") {
    if (!active && !hints.installed)throw new Error("No installed or running "+provider+" editor was detected.");
    return {};
  }
  if (provider==="blender") {
    if (!active && !hints.installed)throw new Error("No installed or running Blender installation detected.");
    const port=hints.bridgePort??9876;
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid Blender port.");
    return {host:"127.0.0.1",port};
  }
  if(provider==="godot"){
    const matches=new Set<string>();
    for(const p of processes){
      if(!/^godot.*\.exe$/i.test(p.name))continue;
      const m=p.commandLine.match(/(?:^|\s)--path\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
      if(m)matches.add(m[1]??m[2]??m[3]);
    }
    if(matches.size>1)throw new Error("Ambiguous Godot projects; supply projectPath.");
    if(matches.size===1)return {projectPath:[...matches][0]};
    if(hints.knownProjectRoot)return {projectPath:hints.knownProjectRoot};
    throw new Error("No unambiguous Godot project; supply projectPath.");
  }
  if(provider==="monogame"){
    if(hints.knownProjectRoot)return {allowedRoot:hints.knownProjectRoot};
    throw new Error("MonoGame workspace cannot be inferred from dotnet; supply allowedRoot.");
  }
  const found=processes.find(p=>/CLIPStudioPaint\.exe$/i.test(p.path));
  if(found)return {executablePath:found.path};
  throw new Error("No running CLIP STUDIO PAINT executable detected.");
}

async function windowsProbe(provider:SupportedProgram):Promise<ProgramProbe[]> {
  if(process.platform!=="win32")return [];
  // The script is static and selected from a provider allowlist. No user-provided code is executed.
  const names=processNames[provider];
  const fixedNames=names.map(n=>"'"+n.replace(/'/g,"''")+"'").join(",");
  const script=[
    "$ErrorActionPreference='SilentlyContinue'",
    "$wanted=@("+fixedNames+")",
    "$list=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $wanted -contains $_.Name"+(provider==="godot"?" -or $_.Name -match '^godot.*\\.exe$'":"")+" } | Select-Object Name,ExecutablePath,CommandLine)",
    "$list | ConvertTo-Json -Compress -Depth 3"
  ].join("\n");
  try {
    const {stdout}=await execFileAsync("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-Command",script],
      {timeout:9000,windowsHide:true,maxBuffer:131072});
    return parseProgramProbe(stdout.trim());
  }catch{return [];}
}

async function windowsInstalledPaths(provider:SupportedProgram):Promise<string[]> {
  if(process.platform!=="win32")return [];
  const names=processNames[provider].map(n=>"'"+n.replace(/'/g,"''")+"'").join(",");
  const pattern=productNames[provider].replace(/'/g,"''");
  const script=[
    "$ErrorActionPreference='SilentlyContinue'",
    "$wanted=@("+names+")",
    "$paths=New-Object System.Collections.Generic.List[string]",
    "$roots=@('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths')",
    "foreach($root in $roots){foreach($n in $wanted){try{$item=Get-Item -LiteralPath ($root+'\\'+$n);if($item){$v=$item.GetValue('');if($v){$paths.Add([string]$v)}}}catch{}}}",
    "foreach($n in $wanted){try{$cmd=Get-Command -Name $n -ErrorAction SilentlyContinue|Select-Object -First 1;if($cmd -and $cmd.Source){$paths.Add([string]$cmd.Source)}}catch{}}",
    "$uninstallRoots=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
    "$pattern='"+pattern+"'",
    "foreach($root in $uninstallRoots){Get-ItemProperty $root -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like ('*'+$pattern+'*') } | ForEach-Object { $icon=[string]$_.DisplayIcon;if($icon){$clean=($icon -replace ',[0-9]+$','').Trim('\"');if($clean){$paths.Add($clean)}}}}",
    "$paths|Select-Object -Unique|ConvertTo-Json -Compress"
  ].join("\n");
  try {
    const {stdout}=await execFileAsync("powershell.exe",["-NoLogo","-NoProfile","-NonInteractive","-Command",script],
      {timeout:9000,windowsHide:true,maxBuffer:65536});
    const parsed=JSON.parse(stdout.trim()||"[]") as unknown;
    const paths=Array.isArray(parsed)?parsed:[parsed];
    const result:string[]=[];
    for(const path of paths.slice(0,30)){
      if(typeof path!=="string")continue;
      if(!processNames[provider].some(n=>basename(path).toLowerCase()===n.toLowerCase()))continue;
      if((await stat(path).catch(()=>null))?.isFile())result.push(path);
    }
    return [...new Set(result)];
  }catch{return [];}
}

export async function inspectProgram(
  provider:SupportedProgram,
  hints:{bridgePort?:number;knownProjectRoot?:string}={}
):Promise<ProgramInspection> {
  const processes=await windowsProbe(provider);
  const installedExecutablePaths:string[]=await windowsInstalledPaths(provider);
  for(const path of new Set(processes.map(p=>p.path).filter(Boolean))){
    if ((await stat(path).catch(()=>null))?.isFile() && !installedExecutablePaths.includes(path))installedExecutablePaths.push(path);
  }
  const connectionCandidates:Array<Record<string,string|number>>=[];
  if(provider==="clipstudio"){
    for(const path of installedExecutablePaths.filter(p=>basename(p).toLowerCase()==="clipstudiopaint.exe"))connectionCandidates.push({executablePath:path});
  } else {
    try {
      const candidate=chooseAutoDetectedSettings(provider,processes,{...hints,installed:installedExecutablePaths.length>0});
      if(provider==="godot"){
        const project=String(candidate.projectPath);
        if((await stat(resolve(project,"project.godot")).catch(()=>null))?.isFile())connectionCandidates.push(candidate);
      }else if(provider==="monogame"){
        const p=String(candidate.allowedRoot);
        if((await stat(p).catch(()=>null))?.isDirectory())connectionCandidates.push(candidate);
      }else connectionCandidates.push(candidate);
    }catch{ /* ambiguous project selection: user must supply an explicit path */ }
  }
  const instructions:Record<SupportedProgram,string>={
    clipstudio:"Detect running/registered CLIP STUDIO PAINT or supply executablePath.",
    blender:"Detect Blender install/process and select a known loopback MCP bridge port; addon must be enabled.",
    unity:"Detect Unity editor install/process; Unity MCP package must be installed in the project.",
    godot:"Infer a single validated project.godot from running Godot --path or supply projectPath.",
    roblox:"Detect Roblox Studio install/process; launcher discovers the installed version.",
    monogame:"Detect dotnet installation but supply allowedRoot (dotnet does not identify a project workspace)."
  };
  return {provider,processes:processes.map(({name,path})=>({name,path})),installedExecutablePaths,connectionCandidates,instructions:instructions[provider]};
}