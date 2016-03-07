var HID = require('node-hid');

function MiniMag2() { // MiniMag2 IDMB3341
	// search USB by vendor/product id
	var devs = new HID.devices(2765, 1312);
	this.hid = new HID.HID(devs[0].path);
}

MiniMag2.prototype.sendCommand = function (cmd) {
	var data = [];

	data.push(0x2); // STX
	data.push.apply(data, cmd); // cmd
	data.push(0x3); // ETX
	data.push(this.lrc(data)); // LRC

	this.sendData(data);
};

MiniMag2.prototype.sendData = function (data) {
	var buf = [ 0x0 ];
	var idx = 0;

	while (idx < data.length) {
		buf = [];

		buf[0] = 0x0; // report id is always 0x0
		buf[1] = (data[idx++] || 0x0);
		buf[2] = (data[idx++] || 0x0);
		buf[3] = (data[idx++] || 0x0);
		buf[4] = (data[idx++] || 0x0);
		buf[5] = (data[idx++] || 0x0);
		buf[6] = (data[idx++] || 0x0);
		buf[7] = (data[idx++] || 0x0);

		console.log('send', buf);
		this.hid.sendFeatureReport(buf);
	}	
};

MiniMag2.prototype.getResponse = function () {
	var resp = [];

	for (var idx = 0; idx < 100; idx++) {
		var r = this.hid.getFeatureReport(0x0, 9);
		var b = new Buffer(r);
		var reportid = r.shift();

		if (resp.length && r[0] == 0x15 && r[1] == 0x0 && r[2] == 0x0 && r[3] == 0x0 && r[4] == 0x0 && r[5] == 0x0 && r[6] == 0x0 && r[7] == 0x0) {
			// cheap: should be detecting whether an ETX character occurred instead
			break;
		}
		else if (resp.length || r[0] == 0x6) {
			resp.push.apply(resp, r);
		}

		console.log(idx, b, b.toString());
	}

	// trim off nulls
	if (resp.length) {
		while (resp[resp.length-1] == 0x0) {
			var c = resp.pop();
		}
	}

	// verify LRC
	var lrc = this.lrc(resp.slice(1, resp.length-1));

	if (lrc != resp[resp.length-1]) {
		console.log("INVALID LRC");
	}
	else {
		console.log("valid lrc");
	}

	// slice off STX, ETX, and LRC
	resp = resp.slice(1, resp.length-2);

	return resp;
};

MiniMag2.prototype.parseData = function (config) {
	var stx = config.shift(); // STX (0x2)
	var items = [];

	while (config.length) {
		var item = {};
		item.id = config.shift();

		if (item.id == 0x3) {
			break; // ETX character
		}

		item.len = config.shift();
		item.value = [];

		for (var idx = 0; idx < item.len; idx++) {
			item.value.push(config.shift());
		}

		items.push(item);
	}

	return items;
};

MiniMag2.prototype.lrc = function (data) {
	return data.reduce(function (lrc, v) {
		return lrc ^ v;
	}, 0);
};

MiniMag2.prototype.retrieveConfig = function () {
	this.sendCommand([ 0x52, 0x1f ]);
	var resp = this.getResponse();
	return this.parseData(resp);
};

MiniMag2.prototype.sendConfig = function (config) {
	var data = [];

	// 0x53: Program
	data.push(0x53);

	// serialize the config
	for (var idx = 0; idx < config.length; idx++) {
		data.push(config[idx].id);
		data.push(config[idx].len);
		data.push.apply(data, config[idx].value);
	}

	this.sendCommand(data);
};

MiniMag2.prototype.setConfigOption = function (id, value) {
	var cfg = this.retrieveConfig();

	for (var idx = 0; idx < cfg.length; idx++) {
		if (cfg[idx].id == id) {
			cfg[idx].len = value.length;
			cfg[idx].value = value;
		}
	}

	this.sendConfig(cfg);
};

var mm = new MiniMag2();

// get firmware revision
// mm.sendCommand([0x52, 0x22]);
// console.log(mm.getResponse());

// get raw config
// mm.sendCommand([0x52, 0x1f]);
// console.log(mm.getResponse());

// set beep to Quick High (see notes)
// (value must be an array)
// mm.setConfigOption(0x11, [ 0x34 ]);
