<template>
    <div>
        <sb-navbar :devices="devices"></sb-navbar>
        <div class="body">
            <h1>Device</h1>
            Choose a device to connect to:<br><br>
            <b-button v-for="device in devices" variant="primary" :href="`/devices/${device.slug}`">{{ device.name }}</b-button>

            <h1>Setup</h1>
            Some terminal windows have <i class="fas fa-external-link-alt"></i> and/or <i class="fas fa-terminal"></i> icons to open telnet, raw TCP, and SSH connections. To customize which application handles the links:
            <ul>
                <li>For telnet links, edit the <code>HKEY_LOCAL_MACHINE\SOFTWARE\Classes\telnet\shell\open\command</code> registry key and set the default value to <code>"&lt;Application path&gt;" %l</code>. For example, <code>"C:\Program Files (x86)\PuTTY\putty.exe" %l</code>.</li>
                <li>For raw and SSH links (this requires Putty):
                    <ul>
                        <li>Create a batch file that will receive the URI and pass the arguments to Putty:
                            <pre><code class="language-batch line-numbers">{{ bat }}</code></pre>
                        </li>
                        <li>Create the following registry entries (the <code>HKEY_CLASSES_ROOT\putty</code> key will need to be created):
                            <ul>
                                <li><code>HKEY_CLASSES_ROOT\putty\URL Protocol</code> = <code>""</code></li>
                                <li><code>HKEY_CLASSES_ROOT\putty\shell\open\command\(Default)</code> = <code>"&lt;Batch file&gt;" %1</code></li>
                            </ul>
                        </li>
                    </ul>
                </li>
            </ul>
            If easier, you can enter the path to the application here to generate the registry files and batch script (this assumes you're using Putty and that you'll put the batch script in Putty's directory; modify the generated files as necessary):
            <form method="post" action="/generate-reg">
                <input type="text" name="app_path" :value="defaultPuttyPath">
                <button type="submit">Generate</button>
            </form>
        </div>
    </div>
</template>

<script>
    import Prism from 'prismjs';
    // Prism is getting confused by the parentheses in "Program Files (x86)" and styling "x86" as a keyword, so this hack works around it by adding an earlier token for that whole string
    Prism.languages.insertBefore('batch', 'command', {programFiles: /Program Files \(x86\)/});

    import SbNavbar from '../components/sb-navbar';
    export default {
        components: {
            'sb-navbar': SbNavbar,
        },
        props: ['devices', 'bat', 'defaultPuttyPath'],
    }
</script>

<style lang="less" scoped>
    .body {
        padding: 20px;

        a.btn {
            margin-left: 20px;
        }

        h1:not(:first-child) {
            margin-top: 3rem;
        }

        form input[type=text] {
            width: 400px;
        }
    }
</style>
