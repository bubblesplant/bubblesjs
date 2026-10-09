import { clamp, fn } from "@bubblesjs/utils";

const message: string = fn();
const value: number = clamp(5, 0, 10);
void message;
void value;

// @ts-expect-error Values must be numbers.
clamp("5", 0, 10);
// @ts-expect-error Lower bounds must be numbers.
clamp(5, "0", 10);
// @ts-expect-error Upper bounds must be numbers.
clamp(5, 0, "10");
// @ts-expect-error All three arguments are required.
clamp(5, 0);
// @ts-expect-error fn does not accept arguments.
fn("extra");
// @ts-expect-error clamp returns a number.
const wrongResult: string = clamp(5, 0, 10);
void wrongResult;
