<template>
    <div>
        <SbNavbar :devices="devices"></SbNavbar>
        <div class="body">
            <h1>Device</h1>
            Choose a device to connect to:<br><br>
            <a v-for="device in devices" class="btn btn-primary" :href="`/devices/${device.slug}`">{{ device.name }}</a>

            <h1>Setup</h1>
            Each terminal window has a <i class="fas fa-external-link-alt"></i> icon to open a telnet connection. To customize what application handles the telnet link, edit the <code>HKEY_LOCAL_MACHINE\SOFTWARE\Classes\telnet\shell\open\command</code> registry key and set the default value to <code>&lt;Application path&gt; %l</code>. For example, <code>"C:\Program Files (x86)\PuTTY\putty.exe" %l</code>.<br><br>
            If easier, you can also enter the path to the application here to generate a registry file:
            <form method="post" action="/generate-reg">
                <input type="text" name="telnet_path" value="C:\Program Files (x86)\PuTTY\putty.exe">
                <button type="submit">Generate</button>
            </form>

        </div>
    </div>
</template>

<script>
    import SbNavbar from '../components/sb-navbar';
    export default {
        components: {
            SbNavbar,
        },
        props: ['devices'],
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
