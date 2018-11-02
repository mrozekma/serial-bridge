<template>
    <b-navbar type="dark" variant="dark" class="navbar-expand-lg">
        <b-navbar-brand v-if="device" href="#">{{ device }}</b-navbar-brand>
        <b-navbar-nav>
            <b-nav-item-dropdown text="Devices">
                <b-dropdown-item v-for="device in devices" :href="`/devices/${device.slug}`">{{ device.name }}</b-dropdown-item>
            </b-nav-item-dropdown>
        </b-navbar-nav>
        <slot></slot>
    </b-navbar>
</template>

<script>
    export default {
        name: "sb-navbar",
        props: ['device', 'devices'],
    }
</script>

<style lang="less" scoped>
    .navbar-nav .nav-item {
        .nav-link {
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