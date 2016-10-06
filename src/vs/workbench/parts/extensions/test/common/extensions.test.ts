/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { LinkedMap as Map } from 'vs/base/common/map';
import { ExtensionDependencies, Extension } from '../../common/extensions';

suite('Extensions Test', () => {

	test('extension has dependencies is false when no dependencies', () => {
		let testObject = aExtensionDependencies(aExtension('e1', 'p1'));

		assert.equal(false, testObject.hasDependencies);
	});

	test('extension has dependencies is true when has dependencies', () => {
		let testObject = aExtensionDependencies(aExtension('e1', 'p1'), aExtension('e1', 'p2'));

		assert.equal(true, testObject.hasDependencies);
	});

	function aExtensionDependencies(extension: Extension, ...extensions: Extension[]): ExtensionDependencies {
		const map = extensions.reduce((r, e) => {
			r.set(`${e.publisher}.${e.name}`, e);
			return r;
		}, new Map<string, Extension>());
		return new ExtensionDependencies(extension, map);
	}

	function aExtension(name: string, publisher: string, ...dependencies: string[]): Extension {
		return new Extension(null, null, null, {
			assets: null,
			date: null,
			description: null,
			displayName: null,
			id: null,
			installCount: null,
			name,
			properties: {
				dependencies,
				engine: null
			},
			publisher,
			publisherDisplayName: null,
			publisherId: null,
			rating: null,
			ratingCount: null,
			version: null
		});
	}
});