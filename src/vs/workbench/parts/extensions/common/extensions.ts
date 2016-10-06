/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import * as path from 'path';
import { readFile } from 'vs/base/node/pfs';
import { asText } from 'vs/base/node/request';
import URI from 'vs/base/common/uri';
import { LinkedMap as Map } from 'vs/base/common/map';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPager } from 'vs/base/common/paging';
import { IQueryOptions, IExtensionManifest, LocalExtensionType, IExtensionGalleryService, ILocalExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData } from 'vs/platform/extensionManagement/common/extensionTelemetry';

export const VIEWLET_ID = 'workbench.view.extensions';

export interface IExtensionsViewlet extends IViewlet {
	search(text: string): void;
}

export enum ExtensionState {
	Installing,
	Installed,
	NeedsRestart,
	Uninstalled
}

export interface IExtension {
	type: LocalExtensionType;
	state: ExtensionState;
	name: string;
	displayName: string;
	publisher: string;
	publisherDisplayName: string;
	version: string;
	latestVersion: string;
	description: string;
	iconUrl: string;
	iconUrlFallback: string;
	licenseUrl: string;
	installCount: number;
	rating: number;
	ratingCount: number;
	outdated: boolean;
	hasDependencies: boolean;
	telemetryData: any;
	getManifest(): TPromise<IExtensionManifest>;
	getReadme(): TPromise<string>;
	hasChangelog : boolean;
	getChangelog() : TPromise<string>;
}

export interface IExtensionDependencies {
	dependencies: IExtensionDependencies[];
	hasDependencies: boolean;
	extension: IExtension;
	dependent: IExtensionDependencies;
}

export const SERVICE_ID = 'extensionsWorkbenchService';

export const IExtensionsWorkbenchService = createDecorator<IExtensionsWorkbenchService>(SERVICE_ID);

export interface IExtensionsWorkbenchService {
	_serviceBrand: any;
	onChange: Event<void>;
	local: IExtension[];
	queryLocal(): TPromise<IExtension[]>;
	queryGallery(options?: IQueryOptions): TPromise<IPager<IExtension>>;
	canInstall(extension: IExtension): boolean;
	install(vsix: string): TPromise<void>;
	install(extension: IExtension, promptToInstallDependencies?: boolean): TPromise<void>;
	uninstall(extension: IExtension): TPromise<void>;
	loadDependencies(extension: IExtension): TPromise<IExtensionDependencies>;
}

export const ConfigurationKey = 'extensions';

export interface IExtensionsConfiguration {
	autoUpdate: boolean;
	recommendations: string[];
}

export interface IExtensionStateProvider {
	(extension: Extension): ExtensionState;
}

export class Extension implements IExtension {

	public needsRestart = false;

	constructor(
		private galleryService: IExtensionGalleryService,
		private stateProvider: IExtensionStateProvider,
		public local: ILocalExtension,
		public gallery: IGalleryExtension = null
	) {}

	get type(): LocalExtensionType {
		return this.local ? this.local.type : null;
	}

	get name(): string {
		return this.local ? this.local.manifest.name : this.gallery.name;
	}

	get displayName(): string {
		if (this.local) {
			return this.local.manifest.displayName || this.local.manifest.name;
		}

		return this.gallery.displayName || this.gallery.name;
	}

	get publisher(): string {
		return this.local ? this.local.manifest.publisher : this.gallery.publisher;
	}

	get publisherDisplayName(): string {
		if (this.local) {
			if (this.local.metadata && this.local.metadata.publisherDisplayName) {
				return this.local.metadata.publisherDisplayName;
			}

			return this.local.manifest.publisher;
		}

		return this.gallery.publisherDisplayName || this.gallery.publisher;
	}

	get version(): string {
		return this.local ? this.local.manifest.version : this.gallery.version;
	}

	get latestVersion(): string {
		return this.gallery ? this.gallery.version : this.local.manifest.version;
	}

	get description(): string {
		return this.local ? this.local.manifest.description : this.gallery.description;
	}

	private get readmeUrl(): string {
		if (this.local && this.local.readmeUrl) {
			return this.local.readmeUrl;
		}

		return this.gallery && this.gallery.assets.readme;
	}

	private get changelogUrl(): string {
		if (this.local && this.local.changelogUrl) {
			return this.local.changelogUrl;
		}

		return this.gallery && this.gallery.assets.changelog;
	}

	get iconUrl(): string {
		return this.localIconUrl || this.galleryIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.localIconUrl || this.galleryIconUrlFallback || this.defaultIconUrl;
	}

	private get localIconUrl(): string {
		return this.local && this.local.manifest.icon
			&& URI.file(path.join(this.local.path, this.local.manifest.icon)).toString();
	}

	private get galleryIconUrl(): string {
		return this.gallery && this.gallery.assets.icon;
	}

	private get galleryIconUrlFallback(): string {
		return this.gallery && this.gallery.assets.iconFallback;
	}

	private get defaultIconUrl(): string {
		return require.toUrl('./media/defaultIcon.png');
	}

	get licenseUrl(): string {
		return this.gallery && this.gallery.assets.license;
	}

	get state(): ExtensionState {
		return this.stateProvider(this);
	}

	get installCount(): number {
		return this.gallery ? this.gallery.installCount : null;
	}

	get rating(): number {
		return this.gallery ? this.gallery.rating : null;
	}

	get ratingCount(): number {
		return this.gallery ? this.gallery.ratingCount : null;
	}

	get outdated(): boolean {
		return this.type === LocalExtensionType.User && semver.gt(this.latestVersion, this.version);
	}

	get telemetryData(): any {
		const { local, gallery } = this;

		if (gallery) {
			return getGalleryExtensionTelemetryData(gallery);
		} else {
			return getLocalExtensionTelemetryData(local);
		}
	}

	getManifest(): TPromise<IExtensionManifest> {
		if (this.local) {
			return TPromise.as(this.local.manifest);
		}

		return this.galleryService.getAsset(this.gallery.assets.manifest)
			.then(asText)
			.then(raw => JSON.parse(raw) as IExtensionManifest);
	}

	getReadme(): TPromise<string> {
		const readmeUrl = this.readmeUrl;

		if (!readmeUrl) {
			return TPromise.wrapError('not available');
		}

		const uri = URI.parse(readmeUrl);

		if (uri.scheme === 'file') {
			return readFile(uri.fsPath, 'utf8');
		}

		return this.galleryService.getAsset(readmeUrl).then(asText);
	}

	get hasChangelog() : boolean {
		return !!(this.changelogUrl);
	}

	getChangelog() : TPromise<string> {
		const changelogUrl = this.changelogUrl;

		if (!changelogUrl) {
			return TPromise.wrapError('not available');
		}

		const uri = URI.parse(changelogUrl);

		if (uri.scheme === 'file') {
			return readFile(uri.fsPath, 'utf8');
		}

		return TPromise.wrapError('not available');
	}

	get hasDependencies(): boolean {
		const { local, gallery } = this;
		if (gallery) {
			return !!gallery.properties.dependencies.length;
		}
		return false;
	}
}

export class ExtensionDependencies implements IExtensionDependencies {

	constructor(private _extension: Extension, private _map: Map<string, Extension>, private _dependent: IExtensionDependencies = null) {}

	get hasDependencies(): boolean {
		return this._extension.gallery.properties.dependencies.length > 0;
	}

	get extension(): IExtension {
		return this._extension;
	}

	get dependent(): IExtensionDependencies {
		return this._dependent;
	}

	get dependencies(): IExtensionDependencies[] {
		return this._extension.gallery.properties.dependencies.map(d => new ExtensionDependencies(this._map.get(d), this._map, this));
	}
}