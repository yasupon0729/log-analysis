/**
 * Result型 - 成功/失敗を表現する型
 * PythonのResult型と同等の機能を提供
 */
export class Result<T, E = Error> {
	private _success: boolean;
	private _value?: T;
	private _error?: E;
	private _stackTrace?: string;

	private constructor(success: boolean, value?: T, error?: E) {
		this._success = success;
		this._value = value;
		this._error = error;
		// エラーが既にstackを持っている場合はそれを使用、そうでなければ新規作成
		this._stackTrace = error
			? error instanceof Error
				? error.stack
				: new Error().stack
			: undefined;
	}

	/**
	 * 成功かどうかを判定
	 */
	get success(): boolean {
		return this._success;
	}

	/**
	 * 成功値を取得（失敗時は例外）
	 */
	get value(): T {
		if (!this._success) {
			throw new Error('Cannot access value on failed Result');
		}
		if (this._value === undefined) {
			throw new Error('Value is undefined despite successful result');
		}
		return this._value;
	}

	/**
	 * エラーを取得（成功時はundefined）
	 */
	get error(): E | undefined {
		if (this._success) {
			return undefined;
		}
		return this._error;
	}

	/**
	 * スタックトレースを取得（成功時はundefined）
	 */
	get stackTrace(): string | undefined {
		if (this._success) {
			return undefined;
		}
		return this._stackTrace;
	}

	/**
	 * 成功結果を作成
	 */
	static ok<T, E = Error>(value: T): Result<T, E> {
		return new Result<T, E>(true, value);
	}

	/**
	 * 失敗結果を作成
	 */
	static err<T, E = Error>(error: E): Result<T, E> {
		return new Result<T, E>(false, undefined, error);
	}

	/**
	 * Resultが成功かどうかを判定（型ガード）
	 */
	static isOk<T, E>(
		result: Result<T, E>,
	): result is Result<T, E> & { success: true; value: T } {
		return result.success;
	}

	/**
	 * Resultが失敗かどうかを判定（型ガード）
	 */
	static isErr<T, E>(
		result: Result<T, E>,
	): result is Result<T, E> & { success: false; error: E } {
		return !result.success;
	}

	/**
	 * boolean値として使用する際の動作（Pythonの__bool__と同等）
	 */
	valueOf(): boolean {
		return this._success;
	}

	/**
	 * Pythonの__bool__メソッドと同等の動作
	 */
	[Symbol.toPrimitive](hint: string): boolean | string {
		if (hint === 'boolean' || hint === 'default') {
			return this._success;
		}
		return this._success
			? 'Result(success=True)'
			: 'Result(success=False)';
	}
}
