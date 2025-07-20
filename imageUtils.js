const debug = require("debug")("StaticMaps-gl.imageUtils");
const sharp = require("sharp");

debug(`simd available: ${sharp.simd(true)}`);

exports.parseImageFormat = (format) => {
	var imageFormat;
	var mimetype;
	var imageOptions = {};

	if (format.startsWith("png")) {
		mimetype = "image/png";
		imageFormat = "png";
	} else if (format.startsWith("jpeg") || format.startsWith("jpg")) {
		mimetype = "image/jpeg";
		imageFormat = "jpeg";
	} else if (format.startsWith("webp")) {
		mimetype = "image/webp";
		imageFormat = "webp";
	} else {
		return undefined;
	}

	if (imageFormat === "jpeg" || imageFormat === "webp") {
		if (format.endsWith("70")) {
			imageOptions.quality = 70;
		} else if (format.endsWith("80")) {
			imageOptions.quality = 80;
		} else if (format.endsWith("90")) {
			imageOptions.quality = 90;
		} else if (format.endsWith("100")) {
			imageOptions.quality = 100;
		}
	} else if (imageFormat === "png") {
		imageOptions.adaptiveFiltering = false;
		imageOptions.progressive = false;
		imageOptions.compressionLevel = 9;
	}

	return {
		format: imageFormat,
		mimetype,
		options: imageOptions,
	};
};

exports.sendImageResponse = (res, width, height, data, imageFormat) => {
	const start = Date.now();

	// Un-premultiply pixel values
	// MapLibre GL buffer contains premultiplied values, which are not handled correctly by sharp
	// since we are dealing with 8-bit RGBA values, normalize alpha onto 0-255 scale and divide
	// it out of RGB values
	for (let i = 0; i < data.length; i += 4) {
		const alpha = data[i + 3];
		const norm = alpha / 255;
		if (alpha === 0) {
			data[i] = 0;
			data[i + 1] = 0;
			data[i + 2] = 0;
		} else {
			data[i] /= norm;
			data[i + 1] = data[i + 1] / norm;
			data[i + 2] = data[i + 2] / norm;
		}
	}

	const image = sharp(data, {
		raw: {
			width: width,
			height: height,
			channels: 4,
		},
	});

	var formattedImage;
	if (imageFormat.format === "png") {
		formattedImage = image.png(imageFormat.options);
	} else if (imageFormat.format === "jpeg") {
		formattedImage = image.jpeg(imageFormat.options);
	} else if (imageFormat.format === "webp") {
		formattedImage = image.webp(imageFormat.options);
	}

	formattedImage.toBuffer((err, data, _info) => {
		if (err) {
			debug(`Error saving image: ${err}`);
			res.status(500).send("Error saving image");
			return;
		}
		debug(`Saving image complete in ${Date.now() - start}ms`);
		res.type(imageFormat.mimetype);
		res.send(data);
	});
};
