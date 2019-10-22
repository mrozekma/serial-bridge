<template>
	<div :class="['jenkins', `result-${build.result}`]">
		<i :class="icon"></i>
		<template v-for="(segment, i) in segments">
			<a v-if="i == 0 && build.link" :href="build.link" target="_blank">
				{{ segment }}
			</a>
			<span v-else>
				<template v-if="i > 0">
					&nbsp;&bull;&nbsp;
				</template>
				{{ segment }}
			</span>
		</template>
	</div>
</template>

<script lang="ts">
	import Vue, { PropType } from 'vue';

	import { BuildJson } from '@/services';

	export interface FinishedBuild extends BuildJson {
		end: Date;
	}

	function twoDigit(d: number) {
		return d < 10 ? '0' + d : '' + d;
	}

	function trySegment(segment: { name: string; start: string | Date } | undefined, segments: string[], now?: Date) {
		if(!segment) {
			return;
		}
		const start = new Date(segment.start);
		const totalSecs = Math.floor(((now || new Date()).getTime() - start.getTime()) / 1000);
		if(totalSecs < 0) {
			segments.push(segment.name);
			return;
		}
		const hours = Math.floor(totalSecs / 60 / 60);
		const minutes = Math.floor((totalSecs - hours * 60 * 60) / 60);
		const seconds = Math.floor(totalSecs - hours * 60 * 60 - minutes * 60);
		const timeStr = hours ? `${hours}:${twoDigit(minutes)}:${twoDigit(seconds)}` : `${minutes}:${twoDigit(seconds)}`;
		segments.push(`${segment.name} (${timeStr})`);
	}

	export default Vue.extend({
		props: {
			build: Object as PropType<BuildJson | FinishedBuild>,
		},
		computed: {
			icon() {
				switch(this.build.result) {
					case true: return 'fas fa-check-circle';
					case false: return 'fas fa-exclamation-circle';
					default: return 'fab fa-jenkins';
				}
			},
			segments(): string[] {
				const rtn: string[] = [], now = this.now;
				trySegment(this.build, rtn, now);
				trySegment(this.build.stage, rtn, now);
				trySegment(this.build.task, rtn, now);
				return rtn;
			},
		},
		data() {
			return {
				now: (this.build as FinishedBuild).end || new Date(),
				nowTick: undefined as NodeJS.Timeout | undefined,
			};
		},
		watch: {
			build: {
				handler() {
					if(this.nowTick === undefined && this.build.result === undefined) {
						this.startTick();
					} else if(this.nowTick !== undefined && this.build.result !== undefined) {
						this.stopTick();
						this.now = (this.build as FinishedBuild).end;
					}
				},
				deep: true,
				immediate: true,
			},
		},
		mounted() {
			if(this.build.result === undefined) {
				this.startTick();
			}
		},
		beforeDestroy() {
			this.stopTick();
		},
		methods: {
			startTick() {
				this.stopTick();
				this.nowTick = setInterval(() => this.now = new Date(), 500);
			},
			stopTick() {
				if(this.nowTick !== undefined) {
					clearInterval(this.nowTick);
					this.nowTick = undefined;
				}
			},
		},
	});
</script>

<style lang="less" scoped>
	.jenkins {
		color: #001529; // Navbar background color
		height: 36px;
		line-height: 36px;
		margin: 5px 0;
		padding: 0 10px;
		max-width: 500px;
		border-radius: 5px;
		overflow: hidden;
		text-overflow: ellipsis;

		> i {
			margin-right: 8px;
		}

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
