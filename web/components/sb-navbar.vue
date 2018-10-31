<template>
    <nav class="navbar navbar-dark navbar-expand-lg bg-dark">
        <div v-if="device" class="navbar-header">
            <a class="navbar-brand" href="#">{{ device }}</a>
        </div>
        <ul class="navbar-nav mr-auto">
            <li class="nav-item dropdown">
                <a href="#" class="nav-link dropdown-toggle" data-toggle="dropdown" role="button">Devices <span class="caret"></span></a>
                <div class="dropdown-menu">
                    <a v-for="device in devices" class="dropdown-item" :href="`/devices/${device.slug}`">{{ device.name }}</a>
                </div>
            </li>
        </ul>
        <ul v-if="!connected" class="navbar-nav">
            <li class="nav-item disconnected">
                <i class="fas fa-network-wired"></i>
                Disconnected
            </li>
        </ul>
    </nav>
</template>

<script>
    export default {
        name: "sb-navbar",
        props: {
            'device': String,
            'devices': Array,
            'connected': {
                type: Boolean,
                default: true,
            },
        },
    }
</script>

<style scoped>
    .disconnected {
        color: #f00;
    }
</style>