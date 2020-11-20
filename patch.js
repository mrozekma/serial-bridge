const fs = require('fs');
const path = 'node_modules/@serialport/bindings/lib/linux-list.js';
const data = fs.readFileSync(path, {
	encoding: 'utf8',
});

if(data.includes('checkPathOfDevicePatched')) {
	// Already patched
	process.exit(0);
}

// Replace the checkPathOfDevice() call
const data2 = data.replace('if (checkPathOfDevice(', 'if (checkPathOfDevicePatched(');
if(data == data2) {
	throw new Error("Failed to patch call");
}

// Append the patched version of checkPathOfDevice()
const data3 = data2 + `
function checkPathOfDevicePatched(path) { // Added by patch.js
	return (path && /bus\\/usb/.test(path)) || checkPathOfDevice(path);
}
`;

fs.copyFileSync(path, path + '.unpatched');
fs.writeFileSync(path, data3);
