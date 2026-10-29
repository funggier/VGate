import { describe, expect, test } from "vitest";
import { chooseAutoDetectedSettings, parseProgramProbe, type ProgramProbe } from "../src/program-discovery.js";

describe("local program discovery",()=>{
  test("parses multiple process results and deduplicates executable paths",()=>{
    const x=parseProgramProbe(JSON.stringify([
      {name:"blender.exe",path:"C:\\Apps\\Blender\\blender.exe",commandLine:""},
      {name:"blender.exe",path:"C:\\Apps\\Blender\\blender.exe",commandLine:""}
    ]));
    expect(x).toHaveLength(1);
    expect(x[0].name).toBe("blender.exe");
  });
  test("Godot autodetection is only safe for a single confirmed project",()=>{
    const x:ProgramProbe[]=[
      {name:"godot.exe",path:"C:\\Apps\\godot.exe",commandLine:'godot.exe --path "C:\\Games\\Foo"'}
    ];
    expect(chooseAutoDetectedSettings("godot",x,{})).toEqual({projectPath:"C:\\Games\\Foo"});
    expect(()=>chooseAutoDetectedSettings("godot",[...x,{...x[0],commandLine:'godot.exe --path "C:\\Games\\Bar"'}],{})).toThrow(/ambiguous/i);
  });
  test("Blender adapter uses only loopback address and configured bridge port",()=>{
    expect(chooseAutoDetectedSettings("blender",[{name:"blender.exe",path:"",commandLine:""}],{bridgePort:9786})).toEqual({host:"127.0.0.1",port:9786});
  });
  test("installed but not running Unity/Roblox/Blender can be selected without executing programs",()=>{
    expect(chooseAutoDetectedSettings("unity",[],{installed:true})).toEqual({});
    expect(chooseAutoDetectedSettings("roblox",[],{installed:true})).toEqual({});
    expect(chooseAutoDetectedSettings("blender",[],{installed:true,bridgePort:9876})).toEqual({host:"127.0.0.1",port:9876});
  });
  test("Unity and Roblox enable native connectors without rewriting executable commands",()=>{
    expect(chooseAutoDetectedSettings("unity",[{name:"Unity.exe",path:"C:\\Unity.exe",commandLine:""}],{})).toEqual({});
    expect(chooseAutoDetectedSettings("roblox",[{name:"RobloxStudioBeta.exe",path:"C:\\RobloxStudioBeta.exe",commandLine:""}],{})).toEqual({});
  });
  test("MonoGame project root is never guessed from dotnet executable alone",()=>{
    expect(()=>chooseAutoDetectedSettings("monogame",[{name:"dotnet.exe",path:"C:\\dotnet.exe",commandLine:""}],{})).toThrow(/workspace/i);
  });
});