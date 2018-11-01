<template>
    <b-navbar type="dark" variant="dark" class="navbar-expand-lg">
        <b-navbar-brand v-if="device" href="#">{{ device }}</b-navbar-brand>
        <b-navbar-nav class="mr-auto">
            <b-nav-item-dropdown text="Devices">
                <b-dropdown-item v-for="device in devices" :href="`/devices/${device.slug}`">{{ device.name }}</b-dropdown-item>
            </b-nav-item-dropdown>
        </b-navbar-nav>
        <b-navbar-nav v-if="connections !== false">
            <b-nav-item v-if="connections === null" class="disconnected">
                <i class="fas fa-network-wired"></i>
                Disconnected
            </b-nav-item>
            <b-nav-item v-else-if="connections.length > 0" v-b-tooltip.hover.bottomleft :title="connections.join('\n')">
                <i class="fas fa-network-wired"></i>
                {{ connections.length }}
            </b-nav-item>
        </b-navbar-nav>
    </b-navbar>
</template>

<script>
    export default {
        name: "sb-navbar",
        props: {
            'device': String,
            'devices': Array,
            'connections': { // null if disconnected, array of names if connected, false to disable the connection entry entirely
                default: false,
            },
        },
    }
</script>

<style lang="less" scoped>
    .navbar-nav .nav-item {
        .nav-link {
            color: #fff;
            word-break: keep-all;
            white-space: nowrap;

            i {
                margin-right: 2px;
            }
        }
        &.disconnected .nav-link {
            color: #f00;
        }
    }
</style>