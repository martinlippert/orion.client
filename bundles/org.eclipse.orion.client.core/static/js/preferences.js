/*******************************************************************************
 * Copyright (c) 2010, 2011 IBM Corporation and others All rights reserved. This
 * program and the accompanying materials are made available under the terms of
 * the Eclipse Public License v1.0 which accompanies this distribution, and is
 * available at http://www.eclipse.org/legal/epl-v10.html
 * 
 * Contributors: IBM Corporation - initial API and implementation
 ******************************************************************************/

/*global dojo window handleGetAuthenticationError handlePutAuthenticationError console setTimeout localStorage*/

/**
 * @namespace The global container for eclipse APIs.
 */
var eclipse = eclipse || {};

eclipse.Preferences = function(_name, _provider) {
	
	var _flushPending = false;
	var _store;
	
	function _flush() {
		return _provider.put(_name, _store);
	}
	
	function _scheduleFlush() {
		if (_flushPending) {
			return;
		}
		_flushPending = true;
		setTimeout( function() {
			if (_flushPending) {
				_flushPending = false;
				_flush();
			}
		},0);
	}
	
	
	this.keys = function() {
		var i, 
			result = [];
		for (i in _store) {
			if (_store.hasOwnProperty(i) && i.charAt(0) !== '/') {
				result.push(i);
			}
		}
		return result;
	};

	
	this.get = function(key) {
		if (key.charAt(0) === '/') {
			throw new Error("Bad character in key name: " + key);
		}
		return _store[key];
	};
	
	this.put = function(key, value) {
		if (key.charAt(0) === '/') {
			throw new Error("Bad character in key name: " + key);
		}
		
		if (_store[key] !== value) {
			_store[key] = value;
			_scheduleFlush();
		}
	};
	
	this.remove = function(key) {
		if (key.charAt(0) === '/') {
			throw new Error("Bad character in key name: " + key);
		}
		
		if (_store[key]) {
			delete _store[key];
			_scheduleFlush();
			return true;			
		}
		return false;
	};
		
	this.clear = function() {
		var i;
		for (i in _store) {
			if (_store.hasOwnProperty(i) && i.charAt(0) !== '/') {
				delete _store[i];
			}
		}
		_scheduleFlush();
	};
	
	this.sync = function() {
		if(_flushPending) {
			_flushPending = false;
			return _flush();
		}
		return _provider.get(_name).then(function(store) {
			_store = store;
		});
	};
	
	this.flush = _flush;
};

eclipse.UserPreferenceProvider = function(location) {
	
	var currentPromise;
	
	this.get = function(name) {
		if (currentPromise) {
			return promise;
		}
		var d = new dojo.Deferred();
		var key = "/orion/preferences/user" + name;
		var data = localStorage.getItem(key);
		if (data !== null) {
			setTimeout(function() {
				d.resolve(JSON.parse(data));
			},0);
		} else {
			currentPromise = d;
			dojo.xhrGet({
				url: location + name,
				headers: {
					"Orion-Version": "1"
				},
				handleAs: "json",
				timeout: 15000,
				load: function(jsonData, ioArgs) {
					localStorage.setItem(key, JSON.stringify(jsonData));
					currentPromise = null;
					d.resolve(jsonData);
				},
				error: function(response, ioArgs) {
					if (ioArgs.xhr.status === 401) {
						handleGetAuthenticationError(ioArgs.xhr, ioArgs);
					} else {
						currentPromise = null;
						d.resolve({});
					}
				}
			});
		}
		return d;
	};
	
	this.put = function(name, data) {
		var d = new dojo.Deferred();
		var key = "/orion/preferences/user" + name;
		var jsonData = JSON.stringify(data);
		localStorage.setItem(key, jsonData);
		dojo.xhrPut({
			url: location + name,
			putData: jsonData,
			headers: {
				"Orion-Version": "1"
			},
			handleAs: "json",
			contentType: "application/json",
			timeout: 15000,
			load: function(jsonData, ioArgs) {
				d.resolve();
			},
			error: function(response, ioArgs) {
				if (ioArgs.xhr.status === 401) {
					handlePutAuthenticationError(ioArgs.xhr, ioArgs);
				} else {
					d.resolve(); // consider throwing here
				}
			}
		});
		return d;
	};
};

eclipse.PreferencesService = function(serviceRegistry, location) {
	
	var _userProvider = new eclipse.UserPreferenceProvider(location);
	
	/**
	 * Retrieves the preferences of the given node name.
	 * @param {String} node Path to a preference node
	 */
	this.getPreferences = function(name) {
		var preferences = new eclipse.Preferences(name, _userProvider);
		var promise = preferences.sync().then(function() {
			return preferences;
		});
		return promise;
	};
	
	var _serviceRegistration = serviceRegistry.registerService("IPreferenceService", this);
};
