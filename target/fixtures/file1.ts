// FizzBuzz sample used by the instrument-endpoint feature.
// Matches the "simplified example of instrumentation" in the spec.
//
// Original behaviour: print FizzBuzz for 1..upper.
// When instrumented, every var/branch/call entry in the CFG emits a
// `__visualizer_send(...)` line, and the dispatcher's stdout is what
// the server forwards to the visualizer.

export function run(): void {
	const upper = 15;
	for (let i = 1; i <= upper; i++) {
		let result;
		if (i % 15 === 0)      result = 'FizzBuzz';
		else if (i % 3 === 0)  result = 'Fizz';
		else if (i % 5 === 0)  result = 'Buzz';
		else                   result = String(i);
		console.log(result);
	}
}// change
