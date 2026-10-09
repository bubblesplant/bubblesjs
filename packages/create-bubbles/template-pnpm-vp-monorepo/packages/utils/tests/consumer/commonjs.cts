import utils = require("@bubblesjs/utils");

const message: string = utils.fn();
const value: number = utils.clamp(5, 0, 10);
void message;
void value;

// @ts-expect-error Values must be numbers.
utils.clamp("5", 0, 10);
// @ts-expect-error Lower bounds must be numbers.
utils.clamp(5, "0", 10);
// @ts-expect-error Upper bounds must be numbers.
utils.clamp(5, 0, "10");
// @ts-expect-error All three arguments are required.
utils.clamp(5, 0);
// @ts-expect-error fn does not accept arguments.
utils.fn("extra");
// @ts-expect-error clamp returns a number.
const wrongResult: string = utils.clamp(5, 0, 10);
void wrongResult;
