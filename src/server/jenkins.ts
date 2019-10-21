import Device from './device';
import { EventEmitter } from 'events';

interface Stage {
	name: string;
	start: Date;
	tasks: Task[];
}

interface Task {
	name: string;
	start: Date;
}

export default class Build extends EventEmitter {
	public readonly start: Date;
	private _result?: boolean;
	private stages: Stage[] = [];

	constructor(public readonly device: string, public readonly name: string, public readonly link?: string) {
		super();
		this.start = new Date();
	}

	get currentStage(): Stage | undefined {
		return this.stages.length > 0 ? this.stages[this.stages.length - 1] : undefined;
	}

	get currentTask(): Task | undefined {
		const stage = this.currentStage;
		return (stage && stage.tasks.length > 0) ? stage.tasks[stage.tasks.length - 1] : undefined;
	}

	get result(): boolean | undefined {
		return this._result;
	}

	set result(result: boolean | undefined) {
		this._result = result;
		this.emit('updated', 'result', result);
	}

	pushStage(name: string): Stage {
		const stage: Stage = {
			name,
			start: new Date(),
			tasks: [],
		};
		this.stages.push(stage);
		this.emit('updated', 'pushStage', stage);
		return stage;
	}

	popStage() {
		if(this.stages.length > 0) {
			this.stages.splice(this.stages.length - 1, 1);
			this.emit('updated', 'popStage');
		}
	}

	pushTask(name: string): Task {
		let stage = this.currentStage;
		if(!stage) {
			stage = this.pushStage("<Unknown stage>");
		}
		const task: Task = {
			name,
			start: new Date(),
		};
		stage.tasks.push(task);
		this.emit('updated', 'pushTask', task);
		return task;
	}

	popTask() {
		const stage = this.currentStage;
		if(stage && stage.tasks.length > 0) {
			stage.tasks.splice(stage.tasks.length - 1, 1);
			this.emit('updated', 'popTask');
		}
	}

	toJSON() {
		const { device, name, link, start, currentStage, currentTask, result } = this;
		return {
			device,
			name, link, start,
			stage: currentStage ? {
				name: currentStage.name,
				start: currentStage.start,
			} : undefined,
			task: currentTask ? {
				name: currentTask.name,
				start: currentTask.start,
			} : undefined,
			result,
		};
	}
}
