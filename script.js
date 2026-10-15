"use strict";

/* =====================================================
   NAOL ANALYSER
   Image Metadata, GPS, Satellite Map and Ethiopian Date
===================================================== */

const $ = (id) => document.getElementById(id);

let currentObjectURL = null;
let currentImageFile = null;

/* =====================================================
   SAFE ELEMENT UPDATES
===================================================== */

function setText(id, value) {
    const elements = document.querySelectorAll(
        `[id="${id}"]`
    );

    elements.forEach((element) => {
        element.textContent =
            value === undefined ||
            value === null ||
            value === ""
                ? "Not available"
                : String(value);
    });
}

function showElement(id, show = true) {
    const element = $(id);

    if (element) {
        element.hidden = !show;
    }
}

function setStatus(message, isError = false) {
    const box = $("analysisStatus");
    const text = $("statusText");

    if (box) {
        box.hidden = false;
        box.style.color = isError ? "#ff7777" : "#9de7ff";
    }

    if (text) {
        text.textContent = message;
    }
}

/* =====================================================
   FILE SIZE
===================================================== */

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) {
        return "Not available";
    }

    if (bytes < 1024) {
        return bytes + " B";
    }

    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(2) + " KB";
    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/* =====================================================
   ETHIOPIAN CALENDAR DATE
===================================================== */

function formatEthiopianDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Not available";
    }

    try {
        const dateFormatter = new Intl.DateTimeFormat(
            "en-u-ca-ethiopic-nu-latn",
            {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Africa/Addis_Ababa"
            }
        );

        return dateFormatter.format(date) + " E.C.";
    } catch (error) {
        console.error("Ethiopian calendar error:", error);

        return "Ethiopian calendar unavailable";
    }
}

/* =====================================================
   DATE PARSING

   EXIF dates commonly look like:
   2026:10:15 10:43:21

   EXIF timestamps may not include a timezone.
===================================================== */

function parseExifDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value !== "string") {
        return null;
    }

    const match = value.match(
        /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/
    );

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const hour = Number(match[4]);
        const minute = Number(match[5]);
        const second = Number(match[6]);

        const result = new Date(
            year,
            month,
            day,
            hour,
            minute,
            second
        );

        if (!isNaN(result.getTime())) {
            return result;
        }
    }

    const parsed = new Date(value);

    return isNaN(parsed.getTime()) ? null : parsed;
}

function formatCaptureDate(date) {
    if (!date) {
        return "Not recorded in image metadata";
    }

    try {
        const localTime = new Intl.DateTimeFormat(
            "en-GB",
            {
                dateStyle: "medium",
                timeStyle: "medium",
                timeZone: "Africa/Addis_Ababa"
            }
        ).format(date);

        const ethiopianDate = formatEthiopianDate(date);

        return (
            ethiopianDate +
            " | " +
            localTime +
            " (Ethiopia time)"
        );
    } catch (error) {
        return date.toLocaleString();
    }
}

/* =====================================================
   GPS COORDINATE VALIDATION
===================================================== */

function validCoordinates(latitude, longitude) {
    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
}

/* =====================================================
   GPS MAP

   Satellite tiles are provided by Esri.
   An internet connection is required.
===================================================== */

function showSatelliteMap(latitude, longitude) {
    if (!validCoordinates(latitude, longitude)) {
        hideSatelliteMap();
        return;
    }

    const mapSection = $("mapSection");
    const mapFrame = $("locationMap");
    const openMapLink = $("openMapLink");

    /*
      If the existing page does not contain a map iframe,
      do not crash the remaining analysis.
    */

    if (!mapSection || !mapFrame) {
        console.error(
            "Map elements missing. Check index.html."
        );
        return;
    }

    const lat = latitude.toFixed(7);
    const lon = longitude.toFixed(7);

    /*
      Satellite map using ArcGIS World Imagery.
      Coordinates come from the image GPS metadata.
    */

    const satelliteURL =
        "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}";

    /*
      Use an interactive OpenStreetMap frame as the
      basic fallback. The external map link opens
      satellite imagery at the recorded coordinates.

      The map itself must never use invented coordinates.
    */

    const embedURL =
        "https://www.google.com/maps?q=" +
        encodeURIComponent(lat + "," + lon) +
        "&t=k&z=18&output=embed";

    mapFrame.src = embedURL;

    mapFrame.setAttribute(
        "title",
        "Satellite map at image GPS coordinates " + lat + ", " + lon
    );

    mapSection.hidden = false;

    if (openMapLink) {
        openMapLink.href =
            "https://www.google.com/maps?q=" +
            encodeURIComponent(lat + "," + lon) +
            "&t=k";

        openMapLink.textContent = "Open Satellite Map ↗";
        openMapLink.target = "_blank";
        openMapLink.rel = "noopener noreferrer";
    }

    /*
      Store the imagery tile URL for future use with
      Leaflet if you later replace the iframe map.
    */

    mapFrame.dataset.satelliteTileURL = satelliteURL;
}

function hideSatelliteMap() {
    const mapSection = $("mapSection");
    const mapFrame = $("locationMap");
    const openMapLink = $("openMapLink");

    if (mapSection) {
        mapSection.hidden = true;
    }

    if (mapFrame) {
        mapFrame.src = "about:blank";
    }

    if (openMapLink) {
        openMapLink.href = "#";
    }
}

/* =====================================================
   RESET IMAGE INFORMATION
===================================================== */

function resetInformation() {
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

    fields.forEach((id) => setText(id, "Not available"));

    setText("gpsStatus", "Checking image metadata...");
    setText("gpsMetadataStatus", "Checking...");
    setText("cameraMetadataStatus", "Checking...");
    setText("imageLoadStatus", "Processing...");

    setText(
        "gpsMessage",
        "Checking whether GPS coordinates are recorded in this image."
    );

    setText("resultsBadge", "Analysing");

    hideSatelliteMap();
}

/* =====================================================
   DISPLAY BASIC INFORMATION
===================================================== */

function displayBasicInformation(file, image) {
    setText("fileName", file.name);
    setText("fileSize", formatFileSize(file.size));

    setText("infoFileName", file.name);
    setText("infoFileSize", formatFileSize(file.size));

    setText(
        "infoDimensions",
        image.naturalWidth + " × " + image.naturalHeight + " pixels"
    );

    setText(
        "infoFileType",
        file.type || "Unknown image format"
    );

    setText(
        "infoModified",
        file.lastModified
            ? formatCaptureDate(new Date(file.lastModified))
            : "Not available"
    );

    setText(
        "infoBasicOrientation",
        image.naturalWidth > image.naturalHeight
            ? "Landscape"
            : image.naturalWidth < image.naturalHeight
                ? "Portrait"
                : "Square"
    );

    setText("imageLoadStatus", "Image loaded successfully");
}

/* =====================================================
   EXIF METADATA ANALYSIS
===================================================== */

async function readImageMetadata(file) {
    if (typeof window.exifr === "undefined") {
        throw new Error(
            "EXIF metadata library did not load. Check your internet connection."
        );
    }

    /*
      Read GPS and common EXIF fields from the actual
      uploaded image file.
    */

    const metadata = await window.exifr.parse(file, {
        gps: true,
        exif: true,
        tiff: true,
        ifd0: true
    });

    return metadata || {};
}

/* =====================================================
   DISPLAY CAMERA INFORMATION
===================================================== */

function displayCameraInformation(metadata) {
    const make = metadata.Make || "Not recorded";
    const model = metadata.Model || "Not recorded";

    setText("cameraMake", make);
    setText("cameraModel", model);

    const captureDate =
        parseExifDate(metadata.DateTimeOriginal) ||
        parseExifDate(metadata.CreateDate) ||
        parseExifDate(metadata.DateTimeDigitized);

    setText(
        "captureDate",
        captureDate
            ? formatCaptureDate(captureDate)
            : "Capture date not recorded in image metadata"
    );

    const orientation = metadata.Orientation;

    const orientationNames = {
        1: "Normal",
        2: "Mirrored horizontally",
        3: "Rotated 180°",
        4: "Mirrored vertically",
        5: "Mirrored and rotated",
        6: "Rotated 90°",
        7: "Mirrored and rotated 90°",
        8: "Rotated 270°"
    };

    setText(
        "imageOrientation",
        orientationNames[orientation] || "Not recorded"
    );

    setText(
        "exposureTime",
        metadata.ExposureTime !== undefined
            ? metadata.ExposureTime + " seconds"
            : "Not recorded"
    );

    setText(
        "aperture",
        metadata.FNumber !== undefined
            ? "f/" + metadata.FNumber
            : "Not recorded"
    );

    setText(
        "isoValue",
        metadata.ISO !== undefined
            ? metadata.ISO
            : "Not recorded"
    );

    setText(
        "focalLength",
        metadata.FocalLength !== undefined
            ? metadata.FocalLength + " mm"
            : "Not recorded"
    );

    const hasCameraInfo = Boolean(metadata.Make || metadata.Model);

    setText(
        "cameraMetadataStatus",
        hasCameraInfo
            ? "Camera metadata found"
            : "Camera information not recorded"
    );
}

/* =====================================================
   DISPLAY GPS INFORMATION
===================================================== */

function displayGPSInformation(metadata) {
    let latitude = metadata.latitude;
    let longitude = metadata.longitude;
    let altitude = metadata.GPSAltitude;

    /*
      exifr normally returns metadata.latitude and
      metadata.longitude when GPS data is available.
    */

    if (
        latitude === undefined ||
        longitude === undefined ||
        !validCoordinates(latitude, longitude)
    ) {
        setText("gpsStatus", "GPS coordinates not available");
        setText("gpsLatitude", "Not recorded");
        setText("gpsLongitude", "Not recorded");
        setText("gpsAltitude", "Not recorded");

        setText(
            "gpsMetadataStatus",
            "No usable GPS coordinates found"
        );

        setText(
            "gpsMessage",
            "This image does not contain usable GPS coordinates. " +
            "The original photo may have been saved without location metadata."
        );

        hideSatelliteMap();
        return;
    }

    setText("gpsStatus", "GPS coordinates found");

    setText("gpsLatitude", latitude.toFixed(7));
    setText("gpsLongitude", longitude.toFixed(7));

    setText(
        "gpsAltitude",
        altitude !== undefined && Number.isFinite(altitude)
            ? altitude.toFixed(2) + " metres"
            : "Altitude not recorded"
    );

    setText(
        "gpsMetadataStatus",
        "GPS coordinates successfully extracted"
    );

    setText(
        "gpsMessage",
        "The map below uses the coordinates stored in the image metadata."
    );

    showSatelliteMap(latitude, longitude);
}

/* =====================================================
   MAIN IMAGE ANALYSIS
===================================================== */

async function analyseImage(file) {
    if (!file) {
        return;
    }

    if (!file.type || !file.type.startsWith("image/")) {
        setStatus(
            "Please select a valid image file.",
            true
        );

        return;
    }

    currentImageFile = file;

    /*
      Release the previous image URL to avoid memory leaks.
    */

    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
    }

    currentObjectURL = URL.createObjectURL(file);

    resetInformation();

    setStatus("Loading your image...");

    showElement("previewSection", true);

    const preview = $("imagePreview");

    if (!preview) {
        setStatus(
            "Image preview element is missing from index.html.",
            true
        );

        return;
    }

    preview.src = currentObjectURL;

    /*
      Wait for the image to load before reading its dimensions.
    */

    try {
        await new Promise((resolve, reject) => {
            preview.onload = resolve;

            preview.onerror = () => {
                reject(new Error("The selected image could not be displayed."));
            };
        });

        displayBasicInformation(file, preview);

    } catch (error) {
        console.error("Image preview error:", error);

        setStatus(
            "The image could not be opened. Try a JPG or PNG image.",
            true
        );

        return;
    }

    setStatus("Image loaded. Reading camera and GPS metadata...");

    try {
        const metadata = await readImageMetadata(file);

        displayCameraInformation(metadata);
        displayGPSInformation(metadata);

        setText("resultsBadge", "Analysis complete");

        setStatus(
            "Analysis complete. Your image information is ready."
        );

    } catch (error) {
        console.error("Metadata analysis error:", error);

        setText(
            "cameraMetadataStatus",
            "Metadata could not be read"
        );

        setText(
            "gpsStatus",
            "GPS metadata could not be read"
        );

        setText(
            "gpsMessage",
            "The image preview loaded, but its metadata could not be read. " +
            "Check your internet connection and try a JPG image."
        );

        setText("resultsBadge", "Partial result");

        hideSatelliteMap();

        setStatus(
            "Image opened, but metadata analysis failed. " +
            "Check your connection and try again.",
            true
        );

    } finally {
        /*
          Jump directly to the information section after
          upload and analysis.
        */

        if ($("resultsSection")) {
            $("resultsSection").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    }
}

/* =====================================================
   FILE UPLOAD
===================================================== */

function handleImageSelection(event) {
    const file =
        event.target.files && event.target.files[0];

    if (file) {
        analyseImage(file);
    }
}

/* =====================================================
   CAMERA CAPTURE
===================================================== */

function openCamera() {
    const cameraInput = $("cameraInput");

    if (cameraInput) {
        cameraInput.click();
    }
}

/* =====================================================
   REMOVE IMAGE
===================================================== */

function removeCurrentImage() {
    if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
    }

    currentImageFile = null;

    if ($("imageInput")) {
        $("imageInput").value = "";
    }

    if ($("cameraInput")) {
        $("cameraInput").value = "";
    }

    if ($("imagePreview")) {
        $("imagePreview").removeAttribute("src");
    }

    showElement("previewSection", false);

    hideSatelliteMap();

    resetInformation();

    setText("resultsBadge", "Waiting");

    setStatus("Choose an image to begin analysis.");
}

/* =====================================================
   VIEW INFORMATION BUTTON
===================================================== */

function scrollToResults() {
    if ($("resultsSection")) {
        $("resultsSection").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

/* =====================================================
   INITIALISE APPLICATION
===================================================== */

function initialiseNaolAnalyser() {
    console.log("Naol Analyser initialising...");

    const imageInput = $("imageInput");
    const cameraInput = $("cameraInput");
    const captureButton = $("captureButton");
    const removeButton = $("removeImage");
    const viewResultsButton = $("viewResultsButton");
    const uploadArea = $("uploadArea");

    if (imageInput) {
        imageInput.addEventListener(
            "change",
            handleImageSelection
        );
    }

    if (cameraInput) {
        cameraInput.addEventListener(
            "change",
            handleImageSelection
        );
    }

    if (captureButton) {
        captureButton.addEventListener(
            "click",
            openCamera
        );
    }

    if (removeButton) {
        removeButton.addEventListener(
            "click",
            removeCurrentImage
        );
    }

    if (viewResultsButton) {
        viewResultsButton.addEventListener(
            "click",
            scrollToResults
        );
    }

    /*
      Allow tapping the upload area to open the file picker.
    */

    if (uploadArea && imageInput) {
        uploadArea.addEventListener("keydown", (event) => {
            if (
                event.key === "Enter" ||
                event.key === " "
            ) {
                event.preventDefault();
                imageInput.click();
            }
        });
    }

    setText("resultsBadge", "Waiting");

    setText(
        "gpsMessage",
        "Upload a photo to check for GPS coordinates."
    );

    setStatus("Ready. Choose a photo to analyse.");

    console.log("Naol Analyser ready.");
}

/* =====================================================
   START
===================================================== */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initialiseNaolAnalyser
    );
} else {
    initialiseNaolAnalyser();
}
