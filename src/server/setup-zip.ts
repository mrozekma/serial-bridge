import JSZip from 'jszip';

export const defaultPuttyPath = 'C:\\Program Files (x86)\\PuTTY\\putty.exe';

export const batFile = (exePath: string = defaultPuttyPath) => `\
@echo off
rem Expects to be invoked via a link of the form "putty:-raw HOST -P PORT", which is also what will be passed in as command-line arguments
set args=%*
rem The browser encodes spaces as %20
setlocal enabledelayedexpansion
set decoded=!args:%%20= !

if "%decoded:~0,6%" == "putty:" (
	start "PuTTY" "${exePath}" %decoded:~6%
) else (
	echo Unexpected arguments
)
`;

const readmeTxt = (parentPath: string) => `\
To support telnet links, run telnet.reg.
To support raw and SSH links in Putty, extract putty.bat to ${parentPath} and run putty.reg.
`;

const telnetReg = (exePath: string) => `\
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\telnet\\shell\\open\\command]
@="\\"${exePath.replace(/\\/g, '\\\\')}\\" %l"

`;

const puttyReg = (parentPath: string) => `\
Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\\putty]
"URL Protocol"=""

[HKEY_CLASSES_ROOT\\putty\\shell]

[HKEY_CLASSES_ROOT\\putty\\shell\\open]

[HKEY_CLASSES_ROOT\\putty\\shell\\open\\command]
@="\\"${parentPath.replace(/\\/g, '\\\\')}putty.bat\\" %1"

`;

function formatNewlines(data: string) {
	return data.replace(/\n/g, '\r\n');
}

export default function(exePath: string = defaultPuttyPath) {
	const idx = exePath.lastIndexOf('\\');
	const parentPath = (idx >= 0) ? exePath.substring(0, idx + 1) : 'C:\\';
	const zip = new JSZip();
	zip.file('README.txt', formatNewlines(readmeTxt(parentPath)));
	zip.file('telnet.reg', formatNewlines(telnetReg(exePath)));
	zip.file('putty.reg', formatNewlines(puttyReg(parentPath)));
	zip.file('putty.bat', formatNewlines(batFile(exePath)));
	return zip.generateAsync({
		type: 'nodebuffer',
	});
}
