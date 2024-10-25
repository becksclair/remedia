// const _testUrl = 'https://www.twitch.tv/videos/2277686226?filter=archives&sort=time';
//
// function isUrl1(input: string): boolean {
// 	try {
// 		const newUrl = new URL(input);
// 		if (newUrl) return true;
// 		return false;
// 	} catch (_) {
// 		// Discard
// 		return false;
// 	}
// }
//
// function isUrl2(input: string): boolean {
// 	const regex =
// 		/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
// 	return regex.test(input);
// }
//
// function isUrl3(input: string): boolean {
// 	return input.startsWith('http');
// }

// Deno.bench('URL Constructor', () => {
// 	isUrl1(testUrl);
// });
//
// Deno.bench('Regex Match', () => {
// 	isUrl2(testUrl);
// });
//
// Deno.bench('Starts With', () => {
// 	isUrl3(testUrl);
// });
