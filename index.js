'use strict';
var crypto = require('crypto');
var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var objectAssign = require('object-assign');

function md5(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

function revHash(contents) {
	return md5(contents).slice(0, 8);
}

function relPath(base, filePath) {
	if (filePath.indexOf(base) !== 0) {
		return filePath.replace(/\\/g, '/');
	}

	var newPath = filePath.substr(base.length).replace(/\\/g, '/');

	if (newPath[0] === '/') {
		return newPath.substr(1);
	}

	return newPath;
}

function revHashPath(filePath, s) {
	var ext = path.extname(filePath);
	var origBaseName = path.basename(filePath, ext);
	return origBaseName + '-' + s + ext;
}

var plugin = function () {
	return through.obj(function (file, enc, cb) {
		if (file.isNull()) {
			cb(null, file);
			return;
		}

		if (file.isStream()) {
			cb(new gutil.PluginError('gulp-rev', 'Streaming not supported'));
			return;
		}

		// save the old path for later
		file.revOrigPath = file.path;
		file.revOrigBase = file.base;

		var hash = file.revHash = revHash(file.contents);
		var filename = revHashPath(file.path, hash);
		file.path = path.join(path.dirname(file.path), filename);
		
		if (file.sourceMap) {
			file.sourceMap.sources = file.sourceMap.sources.map(function(source, idx) {
				var content = file.sourceMap.sourcesContent[idx];
				var hash = revHash(content);
				return revHashPath(source, hash);
			});
		}

		cb(null, file);
	});
};

plugin.manifest = function (opt) {
	opt = objectAssign({path: 'rev-manifest.json'}, opt || {});
	var manifest = {};
	var firstFile = null;

	return through.obj(function (file, enc, cb) {
		// ignore all non-rev'd files
		if (!file.path || !file.revOrigPath) {
			cb();
			return;
		}

		// combine previous manifest
		// only add if key isn't already there
		if (opt.path == file.revOrigPath) {
			var existingManifest = JSON.parse(file.contents.toString());
			manifest = objectAssign(existingManifest, manifest);
		// add file to manifest
		} else {
			firstFile = firstFile || file;
			manifest[relPath(firstFile.revOrigBase, file.revOrigPath)] = relPath(firstFile.base, file.path);
		}

		cb();
	}, function (cb) {
		if (firstFile) {
			this.push(new gutil.File({
				cwd: firstFile.cwd,
				base: firstFile.base,
				path: path.join(firstFile.base, opt.path),
				contents: new Buffer(JSON.stringify(manifest, null, '  '))
			}));
		}

		cb();
	});
};

module.exports = plugin;
