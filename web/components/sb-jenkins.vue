<template>
    <b-nav-text v-if="build" :class="`jenkins result-${result}`" @click="click">
        <i :class="icon"></i>
        <a v-if="build.link" :href="build.link" target="_blank">{{ renderStr('build') }}</a>
        <template v-if="stage">&bull; {{ renderStr('stage') }}</template>
        <template v-if="task">&bull; {{ renderStr('task') }}</template>
    </b-nav-text>
</template>

<script>
    export default {
        props: ['build', 'stage', 'task', 'times', 'result'],
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
            renderStr: function(name) {
                if(!this.times || !this.times[name]) {
                    return this[name].name;
                }
                const total_secs = Math.max(0, Math.floor(this.times[name] / 1000));
                const hours = Math.floor(total_secs / 60 / 60);
                const minutes = Math.floor((total_secs - hours * 60 * 60) / 60);
                const secs = Math.floor(total_secs - hours * 60 * 60 - minutes * 60);

                const twoDigit = d => d < 10 ? '0' + d : '' + d;
                const timeStr = hours ? `${hours}:${twoDigit(minutes)}:${twoDigit(secs)}` : `${minutes}:${twoDigit(secs)}`;
                return `${this[name].name} (${timeStr})`;
            },
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