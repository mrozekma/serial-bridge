<template>
    <b-navbar type="dark" variant="dark" class="navbar-expand-lg">
        <b-navbar-brand v-if="device" href="#">{{ device }}</b-navbar-brand>
        <b-navbar-nav class="mr-auto">
            <b-nav-item-dropdown text="Devices">
                <b-dropdown-item v-for="device in devices" :href="`/devices/${device.slug}`">{{ device.name }}</b-dropdown-item>
            </b-nav-item-dropdown>
        </b-navbar-nav>
        <b-navbar-nav v-if="!connected || true" class="disconnected">
            <i class="fas fa-network-wired"></i>
            Disconnected
        </b-navbar-nav>
    </b-navbar>
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