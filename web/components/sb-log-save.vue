<template>
    <div>
        <div class="dg-content">
            <b-progress :value="remoteProps.progress" :max="remoteProps.total"></b-progress><br>
            {{ remoteProps.msg }}
        </div>
        <br/>

        <b-button variant="primary" :disabled="!remoteProps.enableSaveButtons" @click="done('save-continue')">Save and Continue</b-button>
        <b-button variant="primary" :disabled="!remoteProps.enableSaveButtons" @click="done('save-stop')">Save and Stop</b-button>
        <b-button variant="danger" :disabled="!remoteProps.enableStopButton" @click="done('stop')">Stop</b-button>
    </div>
</template>

<script>
    import DialogMixin from 'vuejs-dialog/dist/vuejs-dialog-mixin.min.js' // Include mixin

    export default {
        mixins: [ DialogMixin ],
        computed: {
            remoteProps: function() {
                return this.options.remoteProps.props;
            }
        },
        methods: {
            done: function(result) {
                this.proceed({dialog: this, result});
            }
        }
    }
</script>

<style scoped>
</style>
