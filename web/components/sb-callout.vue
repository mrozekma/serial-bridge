<template>
    <div :class="`bd-callout bd-callout-${type}`">
        <h4 v-if="title">{{ title }}</h4>
        <slot></slot>
    </div>
</template>

<script>
    export default {
        props: {
            type: {
                type: String,
                default: 'default',
                validator: function(v) {
                    return ['default', 'primary', 'success', 'info', 'warning', 'danger'].indexOf(v) != -1;
                }
            },
            title: String,
        }
    }
</script>

<style lang="less">
    // Callouts from the Bootstrap docs

    .bd-callout {
        padding: 1.25rem;
        margin-top: 1.25rem;
        margin-bottom: 1.25rem;
        border: 1px solid #eee;
        border-left-width: .25rem;
        border-radius: .25rem;

        h4 {
            margin-top: 0;
            margin-bottom: .25rem;
        }

        p:last-child {
            margin-bottom: 0;
        }

        code {
            border-radius: .25rem;
        }

        + .bd-callout {
            margin-top: -.25rem;
        }

        .color(@name, @color) {
            &.bd-callout-@{name} {
                border-left-color: @color;

                h4 {
                    color: @color;
                }
            }
        }

        .color(default, #777);
        .color(primary, #428bca);
        .color(success, #5cb58c);
        .color(info, #5bc0de);
        .color(warning, #f0ad4e);
        .color(danger, #d9534f);
    }
</style>
