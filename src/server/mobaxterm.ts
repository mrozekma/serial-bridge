import { DeviceJson } from '../services';
export type Node = DeviceJson['nodes'][number];

// I won't pretend to understand MobaXterm's serialization format.
// I used https://stackoverflow.com/a/68448852/309308 to generate a link from an existing session and then patched it.

export function makeTelnetEntry(sessionName: string, host: string, deviceName: string, node: Node): string {
    return `${sessionName}= ;  logout#98#1%${host}%${node.tcpPort}%%%2%%%%%0%0%%1080%#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1#0# #-1`;
}

export function makeSshEntry(sessionName: string, deviceName: string, node: Node, keyPath?: string): string {
    const { host, username } = node.ssh!;
    return `${sessionName}= ;  logout#93#0%${host}%22%${username}%%-1%-1%%%22%%0%0%0%${keyPath ?? ''}%%-1%0%0%0%%1080%%0%0%1#MobaFont%10%0%0%-1%15%236,236,236%30,30,30%180,180,192%0%-1%0%%xterm%-1%-1%_Std_Colors_0_%80%24%0%1%-1%<none>%%0%0%-1#0# #-1`;
}

interface BookmarksSection {
    name: string;
    imgNum: number;
    subsections: BookmarksSection[];
    entries: string[];
}

export default function(devices: DeviceJson[], localHost: string, keyPath?: string): string {
    const categories = [...new Set(devices.map(device => device.category))].sort();
    const scns0: BookmarksSection[] = [];
    for(const category of categories) {
        const scns1: BookmarksSection[] = [];
        for(const device of devices.filter(device => device.category === category)) {
            const scns2: BookmarksSection[] = [];
            const host = device.remoteInfo ? (device.remoteInfo.url.split('://')[1]) : localHost;
            for(const node of device.nodes) {
                const entries: string[] = [];
                const sessionName = `${device.name} ${node.name} (Telnet)`;
                entries.push(makeTelnetEntry(sessionName, host, device.name, node));
                if(node.ssh) {
                    const sessionName = `${device.name} ${node.name} (SSH)`;
                    entries.push(makeSshEntry(sessionName, device.name, node, keyPath));
                }
                scns2.push({
                    name: node.name,
                    imgNum: 122,
                    subsections: [],
                    entries,
                });
            }
            scns1.push({
                name: device.name,
                imgNum: 117,
                subsections: scns2,
                entries: [],
            });
        }
        if(category === undefined) {
            scns0.push(...scns1);
        } else {
            scns0.push({
                name: category,
                imgNum: 119,
                subsections: scns1,
                entries: [],
            });
        }
    }

    const lines: string[] = [];
    let idx = 0;
    function process(scn: BookmarksSection, prefix: string = '') {
        lines.push(idx ? `[Bookmarks_${idx}]` : '[Bookmarks]');
        idx++;
        lines.push(`SubRep=${prefix}${scn.name}`);
        lines.push(`ImgNum=${scn.imgNum}`);
        for(const entry of scn.entries) {
            lines.push(entry);
        }
        lines.push('');
        prefix += `${scn.name}\\`;
        for(const subsection of scn.subsections) {
            process(subsection, prefix);
        }
    }
    for(const scn of scns0) {
        process(scn);
    }
    return lines.join('\n');
}
