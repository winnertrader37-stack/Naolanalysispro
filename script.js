/* =========================================
   NAOL ANALYSER
   Automatic Image Analysis
   ========================================= */

"use strict";

const $ = (id) => document.getElementById(id);

const imageInput = $("imageInput");
const cameraInput = $("cameraInput");
const captureButton = $("captureButton");

const uploadArea = $("uploadArea");
const previewSection = $("previewSection");
const imagePreview = $("imagePreview");
const removeImageButton = $("removeImage");

const analysisStatus = $("analysisStatus");
const statusText = $("statusText");
const loadingSpinner = $("loadingSpinner");

const resultsSection = $("resultsSection");
const resultsBadge = $("resultsBadge");

const viewResultsButton = $("viewResultsButton");

const mapSection = $("mapSection");
const locationMap = $("locationMap");
const openMapLink = $("openMapLink");

let currentObjectURL = null;
let analysisVersion = 0;


/* =========================================
   HELPERS
   ========================================= */

function setText(id, value) {
    const element = $(id);

    if (!element) return;

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        element.textContent = "Not available";
    } else {
        element.textContent = String(value);
    }
}


function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown";
    }

    if (bytes < 1024) {
        return bytes + " bytes";
    }

    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}


function formatDate(value) {
    if (!value) {
        return "Not recorded";
    }

    let date;

    if (value instanceof Date) {
        date = value;
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}


function formatCoordinate(value) {
    if (!Number.isFinite(value)) {
        return "Not available";
    }

    return value.toFixed(6) + "°";
}


function setStatus(message, loading = false) {
    analysisStatus.hidden = false;

    statusText.textContent = message;

    loadingSpinner.hidden = !loading;
}


function resetMetadata() {
    const fields = [
        "infoFileName",
        "infoFileSize",
        "infoDimensions",
        "infoFileType",
        "infoModified",
        "infoBasicOrientation",
        "cameraMake",
        "cameraModel",
        "captureDate",
        "imageOrientation",
        "exposureTime",
        "aperture",
        "isoValue",
        "focalLength",
        "gpsLatitude",
        "gpsLongitude",
        "gpsAltitude"
    ];

    fields.forEach((id) => {
        setText(id, "—");
    });

    setText("gpsStatus", "Waiting for image");
    setText("imageLoadStatus", "Waiting");
    setText("cameraMetadataStatus", "Waiting");
    setText("gpsMetadataStatus", "Waiting");

    setText(
        "gpsMessage",
        "GPS information will appear here if the image contains location metadata."
    );

    setText("resultsBadge", "Waiting");

    mapSection.hidden = true;

    locationMap.src = "about:blank";
    openMapLink.removeAttribute("href");
}


/* =========================================
   STATUS INDICATORS
   ========================================= */

function showResultsStatus() {
    resultsBadge.textContent = "Analysed";
    setText("imageLoadStatus", "Successful");
}


/* =========================================
   BASIC IMAGE INFORMATION
   ========================================= */

function displayBasicInformation(file, width, height) {
    setText("fileName", file.name);
    setText("fileSize", formatFileSize(file.size));

    setText("infoFileName", file.name);
    setText("infoFileSize", formatFileSize(file.size));

    setText(
        "infoDimensions",
        width + " × " + height + " pixels"
    );

    setText(
        "infoFileType",
        file.type || "Unknown"
    );

    setText(
        "infoModified",
        file.lastModified
            ? formatDate(new Date(file.lastModified))
            : "Not available"
    );

    setText("infoBasicOrientation", "See camera metadata");

    showResultsStatus();
}


/* =========================================
   PREVIEW
   ========================================= */

function createPreview(file, version) {
    return new Promise((resolve, reject) => {
        if (currentObjectURL) {
            URL.revokeObjectURL(currentObjectURL);
            currentObjectURL = null;
        }

        const objectURL = URL.createObjectURL(file);

        currentObjectURL = objectURL;

        const image = new Image();

        image.onload = function () {
            if (version !== analysisVersion) {
                URL.revokeObjectURL(objectURL);
                resolve(null);
                return;
            }

            imagePreview.src = objectURL;

            previewSection.hidden = false;

            displayBasicInformation(
                file,
                image.naturalWidth,
                image.naturalHeight
            );

            resolve({
                width: image.naturalWidth,
                height: image.naturalHeight
            });
        };

        image.onerror = function () {
            URL.revokeObjectURL(objectURL);

            if (currentObjectURL === objectURL) {
                currentObjectURL = null;
            }

            reject(new Error("Could not decode image."));
        };

        image.src = objectURL;
    });
}


/* =========================================
   CAMERA METADATA
   ========================================= */

async function readMetadata(file, version) {
    if (version !== analysisVersion) return;

    if (!window.exifr || typeof window.exifr.parse !== "function") {
        setText(
            "cameraMetadataStatus",
            "Metadata library unavailable"
        );

        setText(
            "gpsMetadataStatus",
            "Metadata library unavailable"
        );

        setText(
            "gpsStatus",
            "Cannot read metadata"
        );

        return;
    }

    try {
        const metadata = await window.exifr.parse(file, {
            gps: true,
            exif: true,
            tiff: true,
            ifd0: true
        });

        if (version !== analysisVersion) return;

        if (!metadata) {
            showNoMetadata();
            return;
        }

        // Camera manufacturer
        setText(
            "cameraMake",
            metadata.Make || "Not recorded"
        );

        // Camera model
        setText(
            "cameraModel",
            metadata.Model || "Not recorded"
        );

        // Capture date
        const date =
            metadata.DateTimeOriginal ||
            metadata.CreateDate ||
            metadata.ModifyDate;

        setText(
            "captureDate",
            date ? formatDate(date) : "Not recorded"
        );

        // Orientation
        const orientations = {
            1: "Normal",
            2: "Mirrored horizontally",
            3: "Rotated 180°",
            4: "Mirrored vertically",
            5: "Mirrored and rotated",
            6: "Rotated 90°",
            7: "Mirrored and rotated",
            8: "Rotated 270°"
        };

        setText(
            "imageOrientation",
            orientations[metadata.Orientation] ||
            "Not recorded"
        );

        setText(
            "infoBasicOrientation",
            orientations[metadata.Orientation] ||
            "Not recorded"
        );

        // Exposure
        setText(
            "exposureTime",
            metadata.ExposureTime
                ? metadata.ExposureTime + " seconds"
                : "Not recorded"
        );

        // Aperture
        setText(
            "aperture",
            metadata.FNumber
                ? "f/" + metadata.FNumber
                : "Not recorded"
        );

        // ISO
        setText(
            "isoValue",
            metadata.ISO !== undefined
                ? metadata.ISO
                : "Not recorded"
        );

        // Focal length
        setText(
            "focalLength",
            metadata.FocalLength
                ? metadata.FocalLength + " mm"
                : "Not recorded"
        );

        setText(
            "cameraMetadataStatus",
            metadata.Make || metadata.Model
                ? "Camera data found"
                : "Limited camera data"
        );

        // GPS
        handleGPS(metadata);

    } catch (error) {
        if (version !== analysisVersion) return;

        console.error("Metadata error:", error);

        setText(
            "cameraMetadataStatus",
            "Could not read metadata"
        );

        setText(
            "gpsMetadataStatus",
            "Could not read metadata"
        );

        setText(
            "gpsStatus",
            "Metadata reading failed"
        );

        setText(
            "gpsMessage",
            "The image format may not contain readable EXIF data."
        );
    }
}


/* =========================================
   GPS AND MAP
   ========================================= */

function handleGPS(metadata) {
    const latitude = metadata.latitude;
    const longitude = metadata.longitude;

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        setText(
            "gpsStatus",
            "GPS not found"
        );

        setText(
            "gpsLatitude",
            "Not available"
        );

        setText(
            "gpsLongitude",
            "Not available"
        );

        setText(
            "gpsAltitude",
            "Not available"
        );

        setText(
            "gpsMetadataStatus",
            "No GPS coordinates"
        );

        setText(
            "gpsMessage",
            "This image does not contain readable GPS coordinates. The website cannot determine where the photo was taken from the image alone."
        );

        mapSection.hidden = true;

        locationMap.src = "about:blank";

        openMapLink.removeAttribute("href");

        return;
    }

    // Display GPS coordinates
    setText("gpsLatitude", formatCoordinate(latitude));

    setText("gpsLongitude", formatCoordinate(longitude));

    const altitude = metadata.GPSAltitude;

    setText(
        "gpsAltitude",
        Number.isFinite(altitude)
            ? altitude.toFixed(1) + " metres"
            : "Not recorded"
    );

    setText(
        "gpsStatus",
        "Coordinates found"
    );

    setText(
        "gpsMetadataStatus",
        "GPS coordinates found"
    );

    setText(
        "gpsMessage",
        "Coordinates were found in the image metadata. The map shows the recorded coordinates, not independently verified proof of where the photo was taken."
    );

    // Show map only when valid coordinates exist.
    const lat = latitude;
    const lon = longitude;

    const bbox = [
        lon - 0.01,
        lat - 0.01,
        lon + 0.01,
        lat + 0.01
    ].join("%2C");

    const mapURL =
        "https://www.openstreetmap.org/export/embed.html" +
        "?bbox=" + bbox +
        "&layer=mapnik" +
        "&marker=" + lat + "%2C" + lon;

    locationMap.src = mapURL;

    openMapLink.href =
        "https://www.openstreetmap.org/?mlat=" +
        encodeURIComponent(lat) +
        "&mlon=" +
        encodeURIComponent(lon) +
        "#map=16/" +
        encodeURIComponent(lat) +
        "/" +
        encodeURIComponent(lon);

    mapSection.hidden = false;
}


function showNoMetadata() {
    setText("cameraMake", "Not recorded");
    setText("cameraModel", "Not recorded");
    setText("captureDate", "Not recorded");
    setText("imageOrientation", "Not recorded");

    setText("exposureTime", "Not recorded");
    setText("aperture", "Not recorded");
    setText("isoValue", "Not recorded");
    setText("focalLength", "Not recorded");

    setText(
        "cameraMetadataStatus",
        "No EXIF metadata"
    );

    handleGPS({});
}


/* =========================================
   AUTOMATIC IMAGE ANALYSIS
   ========================================= */

async function analyseImage(file) {
    if (!file) return;

    const version = ++analysisVersion;

    // Clear previous object URL and previous results.
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }

    resetMetadata();

    setStatus("Loading image...", true);

    try {
        const dimensions = await createPreview(file, version);

        if (!dimensions || version !== analysisVersion) {
            return;
        }

        setStatus("Reading image metadata...", true);

        await readMetadata(file, version);

        if (version !== analysisVersion) {
            return;
        }

        loadingSpinner.hidden = true;

        setStatus("Image analysis completed.", false);

        resultsBadge.textContent = "Complete";

        // Automatically move to the information section.
        setTimeout(() => {
            if (version !== analysisVersion) return;

            resultsSection.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 250);

    } catch (error) {
        if (version !== analysisVersion) return;

        console.error("Image analysis error:", error);

        loadingSpinner.hidden = true;

        setStatus(
            "Unable to read this image. Try another JPG or PNG file.",
            false
        );

        resultsBadge.textContent = "Error";

        setText(
            "imageLoadStatus",
            "Image could not be opened"
        );
    }
}


/* =========================================
   FILE INPUTS
   ========================================= */

imageInput.addEventListener("change", async function () {
    const file = imageInput.files && imageInput.files[0];

    if (file) {
        await validateAndAnalyse(file);
    }
});


cameraInput.addEventListener("change", async function () {
    const file = cameraInput.files && cameraInput.files[0];

    if (file) {
        await validateAndAnalyse(file);
    }
});


/* =========================================
   CAMERA BUTTON
   ========================================= */

captureButton.addEventListener("click", function () {
    cameraInput.click();
});


/* =========================================
   VALIDATION
   ========================================= */

async function validateAndAnalyse(file) {
    if (!file.type.startsWith("image/")) {
        window.alert("Please select a valid image.");

        imageInput.value = "";
        cameraInput.value = "";

        return;
    }

    const maxSize = 30 * 1024 * 1024;

    if (file.size > maxSize) {
        window.alert(
            "This image is larger than 30 MB. Please choose a smaller image."
        );

        imageInput.value = "";
        cameraInput.value = "";

        return;
    }

    await analyseImage(file);
}


/* =========================================
   REMOVE IMAGE
   ========================================= */

function clearImage() {
    analysisVersion++;

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }

    imageInput.value = "";
    cameraInput.value = "";

    imagePreview.removeAttribute("src");

    previewSection.hidden = true;

    analysisStatus.hidden = true;

    resetMetadata();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


removeImageButton.addEventListener("click", clearImage);


/* =========================================
   VIEW RESULTS BUTTON
   ========================================= */

viewResultsButton.addEventListener("click", function () {
    resultsSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});


/* =========================================
   DRAG AND DROP
   ========================================= */

uploadArea.addEventListener("dragover", function (event) {
    event.preventDefault();

    uploadArea.classList.add("drag-over");
});


uploadArea.addEventListener("dragleave", function () {
    uploadArea.classList.remove("drag-over");
});


uploadArea.addEventListener("drop", async function (event) {
    event.preventDefault();

    uploadArea.classList.remove("drag-over");

    const files = event.dataTransfer &&
                  event.dataTransfer.files;

    if (files && files.length > 0) {
        await validateAndAnalyse(files[0]);
    }
});


/* =========================================
   CLEANUP
   ========================================= */

window.addEventListener("beforeunload", function () {
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }
});


/* =========================================
   INITIALIZE
   ========================================= */

resetMetadata();

console.log("Naol Analyser is ready.");
