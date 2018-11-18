<template>
    <b-nav-text v-if="build_name" :class="`jenkins result-${result}`" @click="click">
        <i :class="icon"></i>
        <a v-if="build_name" :href="build_link" target="_blank">{{ build_name }}</a>
        <template v-if="stage">&bull; {{ stage }}</template>
        <template v-if="task">&bull; {{ task}}</template>
    </b-nav-text>
</template>

<script>
    export default {
        props: ['build_name', 'build_link', 'stage', 'task', 'result'],
        computed: {
            icon: function() {
                switch(this.result) {
                    case true: return 'fas fa-check-circle';
                    case false: return 'fas fa-exclamation-circle';
                    default: return 'fab fa-jenkins';
                }
            },
        },
        methods: {
            click: function() {
                if(this.result === true || this.result === false) {
                    this.$emit('close');
                }
            },
        },
    }
</script>

<style lang="less" scoped>
    .jenkins {
        color: #343a40; // Navbar background color
        border-radius: 5px;
        padding-left: 10px;
        padding-right: 10px;

        background-color: #fff;
        &.result-true {
            background-color: #9f9;
            cursor: pointer;
        }
        &.result-false {
            background-color: #f99;
            cursor: pointer;
        }

        a, a:hover, a:focus {
            color: #007bff;
            text-decoration: none;
        }
    }
</style>