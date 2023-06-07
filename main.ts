// Importing necessary libraries from 'obsidian'
import { App, ItemView, WorkspaceLeaf, Plugin, PluginSettingTab, Setting, MarkdownView, setIcon } from 'obsidian';

interface Condition {
    text: string;
    icon: string;
}

interface AirQuality {
    co: number;
    no2: number;
    o3: number;
    so2: number;
    pm2_5: number;
    pm10: number;
    "us-epa-index": number;
    "gb-defra-index": number;
}

interface Current {
    temp_c: number;
    feelslike_c: number;
    temp_f: number;
    feelslike_f: number;
    condition: Condition;
    wind_kph: number;
    humidity: number;
    uv: number;
    air_quality: AirQuality;
}

interface Location {
    name: string;
    region: string;
    country: string;
    localtime: string;
}

interface DayForecast {
    maxtemp_c: number;
    maxtemp_f: number;
    mintemp_c: number;
    mintemp_f: number;
    avgtemp_c: number;
    avgtemp_f: number;
    maxwind_mph: number;
    maxwind_kph: number;
    totalprecip_mm: number;
    totalprecip_in: number;
    totalsnow_cm: number;
    avgvis_km: number;
    avgvis_miles: number;
    avghumidity: number;
    daily_will_it_rain: number;
    daily_chance_of_rain: number;
    daily_will_it_snow: number;
    daily_chance_of_snow: number;
    condition: Condition;
    uv: number;
}

interface Astro {
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
    moon_phase: string;
    moon_illumination: string;
    is_moon_up: number;
    is_sun_up: number;
}

interface ForecastDay {
    date: string;
    date_epoch: number;
    day: DayForecast;
    astro: Astro;
    hour: any[]; // You can replace 'any' with a more specific interface if needed
}

interface Forecast {
    forecastday: ForecastDay[];
}

interface WeatherAPIResponse {
    current: Current;
    location: Location;
    forecast?: Forecast;
}

interface WeatherPluginSettings {
    location: string;
    apiKey: string;
    refreshRate: number; // new setting for refresh rate in minutes
    temperatureUnit: 'C' | 'F';
    hideAirQuality: boolean | false;
}

const DEFAULT_SETTINGS: WeatherPluginSettings = {
    location: '',
    apiKey: '',
    refreshRate: 30,  // default refresh rate is 30 minutes
    temperatureUnit: 'C',
    hideAirQuality: false
};

function linearInterpolate(value: number, x: number[], y: number[]): number {
    if (value <= x[0]) {
        return y[0];
    } else if (value >= x[x.length - 1]) {
        return y[y.length - 1];
    } else {
        let i = 1;
        while (value > x[i]) {
            i++;
        }
        const slope = (y[i] - y[i - 1]) / (x[i] - x[i - 1]);
        const yIntercept = y[i - 1] - slope * x[i - 1];
        return Math.round(slope * value + yIntercept);
    }
}

function calculatePollutantAQI(concentration: number, pollutant: string): number {
    const c = concentration;
    let AQI;

    let breakpoints, AQIcalc;
    switch (pollutant) {
        case "co":
            breakpoints = [0, 4.4, 9.4, 12.4, 15.4, 30.4, 40.4, 50.4];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "no2":
            breakpoints = [0, 53, 100, 360, 649, 1249];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300]);
            break;
        case "o3":
            breakpoints = [0, 54, 70, 85, 105, 200];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300]);
            break;
        case "so2":
            breakpoints = [0, 35, 75, 185, 304, 604];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300]);
            break;
        case "pm2.5":
            breakpoints = [0, 12.0, 35.4, 55.4, 150.4, 250.4, 350.4, 500.4];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "pm10":
            breakpoints = [0, 54, 154, 254, 354, 424, 504, 604];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        default:
            throw new Error(`Invalid pollutant "${pollutant}"`);
    }

    AQI = Math.round(AQIcalc);
    return AQI;
}



function calculateAQI(co: number, no2: number, o3: number, so2: number, pm25: number, pm10: number): number {
    const co_ppm = co / 1000;
    const no2_ppm = no2 / 1000;
    const o3_ppm = o3 / 1000;
    const so2_ppm = so2 / 1000;

    const coAQI = calculatePollutantAQI(co_ppm, "co");
    const no2AQI = calculatePollutantAQI(no2_ppm, "no2");
    const o3AQI = calculatePollutantAQI(o3_ppm, "o3");
    const so2AQI = calculatePollutantAQI(so2_ppm, "so2");
    const pm25AQI = calculatePollutantAQI(pm25, "pm2.5");
    const pm10AQI = calculatePollutantAQI(pm10, "pm10");

    return Math.max(coAQI, no2AQI, o3AQI, so2AQI, pm25AQI, pm10AQI);
}

function describeAirQuality(data: AirQuality): { emoji: string, text: string, mainContributors: string } {
    const aqi = calculateAQI(data.co, data.no2, data.o3, data.so2, data.pm2_5, data.pm10);
    let unsafeDescriptions = "";
    if (aqi > 100) {
        const unsafePollutants = [
            { name: 'CO', value: data.co },
            { name: 'NO2', value: data.no2 },
            { name: 'O3', value: data.o3 },
            { name: 'SO2', value: data.so2 },
            { name: 'PM2.5', value: data.pm2_5 },
            { name: 'PM10', value: data.pm10 },
        ].filter(pollutant => calculatePollutantAQI(pollutant.value, pollutant.name.toLowerCase()) >= 100);

        unsafeDescriptions = unsafePollutants.map(pollutant => `${pollutant.name}: ${pollutant.value.toFixed(0)} µg/m³`).join(', ');

    }

    let airQualityEmoji: string;
    let airQualityText: string;
    if (aqi <= 50) {
        airQualityEmoji = "😀";
        airQualityText = "Good";
    } else if (aqi <= 100) {
        airQualityEmoji = "😐";
        airQualityText = "Moderate";
    } else if (aqi <= 150) {
        airQualityEmoji = "😷";
        airQualityText = "Unhealthy for Sensitive Groups";
    } else if (aqi <= 200) {
        airQualityEmoji = "🤢";
        airQualityText = "Unhealthy";
    } else if (aqi <= 300) {
        airQualityEmoji = "🤮";
        airQualityText = "Very Unhealthy";
    } else {
        airQualityEmoji = "💀";
        airQualityText = "Hazardous";
    }

    return { emoji: airQualityEmoji, text: airQualityText, mainContributors: unsafeDescriptions };
}

function getUVIndexDescription(uvIndex: number): string {
    if (uvIndex >= 0 && uvIndex <= 2) {
        return "Low";
    } else if (uvIndex <= 5) {
        return "Moderate";
    } else if (uvIndex <= 7) {
        return "High";
    } else if (uvIndex <= 10) {
        return "Very High";
    } else {
        return "Extreme";
    }
}

class WeatherView extends ItemView {
    plugin: ObsidianWeatherPlugin;
    containerEl: HTMLElement; //new
    contentEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianWeatherPlugin) {
        super(leaf);
        this.plugin = plugin;

        this.containerEl = createDiv();
        this.containerEl.className = 'obsidian-weather-plugin';

        this.contentEl = createDiv();
        this.contentEl.className = 'weather-content';

        this.setContent('');

        this.setButtons();

        this.containerEl.appendChild(this.contentEl);

    }

    setButtons() {
        const refreshIcon = createEl('div');
        refreshIcon.className = 'weather-refresh-button';

        setIcon(refreshIcon, 'refresh-ccw');

        refreshIcon.onclick = () => {
            this.plugin.refreshWeather();
        };

        const iconContainer = createDiv();
        iconContainer.className = 'weather-icon-container';
        iconContainer.appendChild(refreshIcon);

        this.containerEl.appendChild(iconContainer);

    }

    setContent(weatherHTML: string) {
        this.contentEl.innerHTML = weatherHTML;
    }


    getViewType(): string {
        return 'WeatherView';
    }

    getDisplayText(): string {
        return 'Obsidian Weather';
    }


    getIcon(): string {
        return 'cloud-sun'; // Or whatever icon you want to use
    }

    async onOpen() {
        // Schedule the initial refresh when the view is opened
        this.plugin.scheduleRefresh();
    }
}

export default class ObsidianWeatherPlugin extends Plugin {
    settings: WeatherPluginSettings;
    refreshTimer: NodeJS.Timeout | null = null; // timer for scheduling refreshes

    async onload() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        this.addSettingTab(new WeatherSettingTab(this.app, this));

        this.registerView('WeatherView', (leaf: WorkspaceLeaf) => {
            const view = new WeatherView(leaf, this);
            this.refreshWeather(); // Refresh weather when the plugin first starts
            return view;
        });

        this.addCommand({
            id: 'open-weather',
            name: 'Open Weather',
            callback: () => {
                this.app.workspace.getRightLeaf(false).setViewState({
                    type: 'WeatherView',
                });
            },
        });

        this.addCommand({
            id: 'refresh-weather',
            name: 'Refresh Weather',
            callback: () => {
                this.refreshWeather(); // Call refreshWeather on the plugin instance, not the view
            },
        });

        // Refresh the weather when the plugin first starts
        this.refreshWeather();
    }

    async refreshWeather() {
        // console.log('Refreshing weather...');
        if (!this.settings.apiKey || !this.settings.location) return;

        const url = `http://api.weatherapi.com/v1/forecast.json?key=${this.settings.apiKey}&q=${this.settings.location}&days=3&aqi=yes`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch weather data. Status: ${response.status} ${response.statusText}`);
            }
            const data: WeatherAPIResponse = await response.json();

            if (data.forecast) {

                const weatherHTML = this.createWeatherHTML(data);
                this.updateWeatherLeaf(weatherHTML);

            }
        } catch (error) {
            console.error('Error fetching weather data:', error);
        }

        // Schedule the next refresh
        this.scheduleRefresh();
    }

    scheduleRefresh() {
        // Clear the previous timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Schedule a new timer only if refreshRate is not set to 999
        if (this.settings.refreshRate !== 999) {
            this.refreshTimer = setTimeout(() => this.refreshWeather(), this.settings.refreshRate * 60 * 1000);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Schedule a refresh when the settings are loaded
        this.scheduleRefresh();
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // Schedule a refresh when the settings are saved
        this.scheduleRefresh();
    }

    createWeatherHTML(data: WeatherAPIResponse): string {
        const { current, location, forecast } = data;
        const { condition, air_quality, uv } = current;

        const aqi = calculateAQI(
            air_quality.co,
            air_quality.no2,
            air_quality.o3,
            air_quality.so2,
            air_quality.pm2_5,
            air_quality.pm10
        );

        const getAirQualityColor = (index: number): string => {
            switch (index) {
                case 1:
                    return '#008000'; // Green
                case 2:
                    return '#FFFF00'; // Yellow
                case 3:
                    return '#FFA500'; // Orange
                case 4:
                    return '#FF0000'; // Red
                case 5:
                    return '#800080'; // Purple
                case 6:
                    return '#800000'; // Maroon
                default:
                    return '#000000'; // Default color for unknown values
            }
        };

        const { emoji: airQualityEmoji, text: airQualityText, mainContributors: unsafeContributors } = describeAirQuality(air_quality);

        const airQualityIndex = air_quality["us-epa-index"];
        const airQualityColor = getAirQualityColor(airQualityIndex);

        const airQualityDescription = `${airQualityEmoji} ${airQualityText} (AQI: ${aqi}`;

        const airQualityContributors = `${unsafeContributors}`;

        const uvIndexDescription = getUVIndexDescription(uv);
        const uvIndexText = `${uv} - ${uvIndexDescription}`;

        const forecastDay1 = forecast?.forecastday[0];
        const forecastDay2 = forecast?.forecastday[1];
        const forecastDay3 = forecast?.forecastday[2];

        let date_day1 = "";
        let date_day2 = "";
        let date_day3 = "";
        if (forecastDay1) {
            date_day1 = new Date(forecastDay1.date_epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        if (forecastDay2) {
            date_day2 = new Date(forecastDay2.date_epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        if (forecastDay3) {
            date_day3 = new Date(forecastDay3.date_epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        let icon_day1 = forecastDay1?.day.condition.icon || "";
        let icon_day2 = forecastDay2?.day.condition.icon || "";
        let icon_day3 = forecastDay3?.day.condition.icon || "";

        let chance_rain_day1 = forecastDay1?.day.daily_chance_of_rain.toString() || "";
        let chance_rain_day2 = forecastDay2?.day.daily_chance_of_rain.toString() || "";
        let chance_rain_day3 = forecastDay3?.day.daily_chance_of_rain.toString() || "";

        if (chance_rain_day1 === "0") {
            chance_rain_day1 = "-";
        } else {
            chance_rain_day1 = chance_rain_day1 + "%";
        }

        if (chance_rain_day2 === "0") {
            chance_rain_day2 = "-";
        } else {
            chance_rain_day2 = chance_rain_day2 + "%";
        }

        if (chance_rain_day3 === "0") {
            chance_rain_day3 = "-";
        } else {
            chance_rain_day3 = chance_rain_day3 + "%";
        }

        const containerEl = document.createElement('div');
        containerEl.style.textAlign = 'center';

        const locationEl = document.createElement('div');
        locationEl.className = 'location-name';
        locationEl.textContent = location.name;
        containerEl.appendChild(locationEl);

        const flexContainerEl = document.createElement('div');
        flexContainerEl.style.display = 'flex';
        flexContainerEl.style.alignItems = 'center';
        flexContainerEl.style.justifyContent = 'center';

        const iconContainerEl = document.createElement('div');
        iconContainerEl.style.marginRight = '5px';

        const iconEl = document.createElement('img');
        iconEl.src = `http:${condition.icon}`;
        iconEl.alt = condition.text;
        iconEl.style.width = '100px';
        iconEl.style.height = '100px';
        iconContainerEl.appendChild(iconEl);
        flexContainerEl.appendChild(iconContainerEl);

        const infoContainerEl = document.createElement('div');
        infoContainerEl.style.textAlign = 'center';
        infoContainerEl.style.display = 'flex';
        infoContainerEl.style.flexDirection = 'column';

        const temperatureContainerEl = document.createElement('div');
        temperatureContainerEl.style.display = 'flex';
        temperatureContainerEl.style.alignItems = 'center';
        temperatureContainerEl.style.justifyContent = 'center';

        const temperatureEl = document.createElement('div');
        const feelsLikeEl = document.createElement('span');
        feelsLikeEl.className = 'feels-like';

        if (this.settings.temperatureUnit === 'C') {
            temperatureEl.textContent = `${current.temp_c}°C`;
            feelsLikeEl.textContent = `${current.feelslike_c}°C`;
        } else {
            temperatureEl.textContent = `${current.temp_f}°F`;
            feelsLikeEl.textContent = `${current.feelslike_f}°F`;
        }

        const spaceE1 = document.createElement('span');
        spaceE1.style.marginLeft = '0.2em';
        spaceE1.style.marginRight = '0.2em';
        spaceE1.textContent = '\u00A0'; // Non-breaking space

        const spaceE2 = document.createElement('span');
        spaceE2.style.marginLeft = '0.2em';
        spaceE2.style.marginRight = '0.2em';
        spaceE2.textContent = '\u00A0'; // Non-breaking space

        temperatureEl.appendChild(spaceE1);
        temperatureEl.appendChild(feelsLikeEl);
        temperatureContainerEl.appendChild(temperatureEl);


        const humidityEl = document.createElement('div');
        humidityEl.textContent = `Humidity:`;


        const humidityValueE1 = document.createElement('span');
        humidityValueE1.className = `humidity`;
        humidityValueE1.textContent = `${current.humidity}%`;
        humidityEl.appendChild(spaceE2);
        humidityEl.appendChild(humidityValueE1);

        const uvEl = document.createElement('div');
        uvEl.textContent = `UV: ${uvIndexText}`;

        infoContainerEl.appendChild(temperatureContainerEl);
        infoContainerEl.appendChild(humidityEl);
        infoContainerEl.appendChild(uvEl);
        flexContainerEl.appendChild(infoContainerEl);

        containerEl.appendChild(flexContainerEl);

        const conditionTextEl = document.createElement('div');
        conditionTextEl.className = 'condition-text';
        conditionTextEl.textContent = condition.text;
        containerEl.appendChild(conditionTextEl);

        if (!this.settings.hideAirQuality) {

            const airQualityDescEl = document.createElement('div');
            airQualityDescEl.style.textAlign = 'center';
            airQualityDescEl.style.fontSize = '0.9em';
            airQualityDescEl.textContent = airQualityDescription;

            const circleEl = document.createElement('div');
            circleEl.style.display = 'inline-block';
            circleEl.style.width = '10px';
            circleEl.style.height = '10px';
            circleEl.style.borderRadius = '50%';
            circleEl.style.marginLeft = '5px';
            circleEl.style.marginRight = '5px'; // Added right margin
            circleEl.style.backgroundColor = airQualityColor;

            airQualityDescEl.appendChild(document.createTextNode(' -'));
            airQualityDescEl.appendChild(circleEl);
            airQualityDescEl.appendChild(document.createTextNode(')'));

            containerEl.appendChild(airQualityDescEl);

            const airQualityContributorsEl = document.createElement('div');
            airQualityContributorsEl.style.color = 'var(--color-accent)';
            airQualityContributorsEl.style.fontSize = '0.9em';
            airQualityContributorsEl.style.marginBottom = '10px';
            airQualityContributorsEl.style.textAlign = 'center';
            airQualityContributorsEl.textContent = airQualityContributors;
            containerEl.appendChild(airQualityContributorsEl);
        }

        const forecastContainerEl = document.createElement('div');
        forecastContainerEl.style.display = 'flex';
        forecastContainerEl.style.justifyContent = 'center';

        const forecastDay1ContainerEl = document.createElement('div');
        forecastDay1ContainerEl.style.display = 'flex';
        forecastDay1ContainerEl.style.flexDirection = 'column';
        forecastDay1ContainerEl.style.alignItems = 'center';
        forecastDay1ContainerEl.style.marginRight = '10px';

        const forecastDay1DateEl = document.createElement('div');
        forecastDay1DateEl.style.fontSize = '0.8em';
        forecastDay1DateEl.style.marginBottom = '5px';
        forecastDay1DateEl.textContent = date_day1 === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ? 'TODAY' : date_day1;
        forecastDay1ContainerEl.appendChild(forecastDay1DateEl);

        const forecastDay1IconEl = document.createElement('img');
        forecastDay1IconEl.src = `http:${icon_day1}`;
        forecastDay1IconEl.alt = 'Day 1';
        forecastDay1IconEl.style.width = '48px';
        forecastDay1IconEl.style.height = '48px';
        forecastDay1ContainerEl.appendChild(forecastDay1IconEl);

        const forecastDay1RainEl = document.createElement('div');
        forecastDay1RainEl.textContent = `${chance_rain_day1}`;
        forecastDay1ContainerEl.appendChild(forecastDay1RainEl);

        forecastContainerEl.appendChild(forecastDay1ContainerEl);

        const forecastDay2ContainerEl = document.createElement('div');
        forecastDay2ContainerEl.style.display = 'flex';
        forecastDay2ContainerEl.style.flexDirection = 'column';
        forecastDay2ContainerEl.style.alignItems = 'center';
        forecastDay2ContainerEl.style.marginRight = '10px';

        const forecastDay2DateEl = document.createElement('div');
        forecastDay2DateEl.style.fontSize = '0.8em';
        forecastDay2DateEl.style.marginBottom = '5px';
        forecastDay2DateEl.textContent = date_day2;
        forecastDay2ContainerEl.appendChild(forecastDay2DateEl);

        const forecastDay2IconEl = document.createElement('img');
        forecastDay2IconEl.src = `http:${icon_day2}`;
        forecastDay2IconEl.alt = 'Day 2';
        forecastDay2IconEl.style.width = '48px';
        forecastDay2IconEl.style.height = '48px';
        forecastDay2ContainerEl.appendChild(forecastDay2IconEl);

        const forecastDay2RainEl = document.createElement('div');
        forecastDay2RainEl.textContent = `${chance_rain_day2}`;
        forecastDay2ContainerEl.appendChild(forecastDay2RainEl);

        forecastContainerEl.appendChild(forecastDay2ContainerEl);

        const forecastDay3ContainerEl = document.createElement('div');
        forecastDay3ContainerEl.style.display = 'flex';
        forecastDay3ContainerEl.style.flexDirection = 'column';
        forecastDay3ContainerEl.style.alignItems = 'center';

        const forecastDay3DateEl = document.createElement('div');
        forecastDay3DateEl.style.fontSize = '0.8em';
        forecastDay3DateEl.style.marginBottom = '5px';
        forecastDay3DateEl.textContent = date_day3;
        forecastDay3ContainerEl.appendChild(forecastDay3DateEl);

        const forecastDay3IconEl = document.createElement('img');
        forecastDay3IconEl.src = `http:${icon_day3}`;
        forecastDay3IconEl.alt = 'Day 3';
        forecastDay3IconEl.style.width = '48px';
        forecastDay3IconEl.style.height = '48px';
        forecastDay3ContainerEl.appendChild(forecastDay3IconEl);

        const forecastDay3RainEl = document.createElement('div');
        forecastDay3RainEl.textContent = `${chance_rain_day3}`;
        forecastDay3ContainerEl.appendChild(forecastDay3RainEl);

        forecastContainerEl.appendChild(forecastDay3ContainerEl);

        containerEl.appendChild(forecastContainerEl);

        const localTimeEl = document.createElement('div');
        localTimeEl.className = 'update-time';
        localTimeEl.textContent = location.localtime;
        containerEl.appendChild(localTimeEl);

        return containerEl.outerHTML;

    }

    // Function to update the weather leaf
    updateWeatherLeaf(weatherHTML: string) {
        const leaves = this.app.workspace.getLeavesOfType('WeatherView');
        if (leaves.length) {
            const view = leaves[0].view as WeatherView;
            // view.contentEl.innerHTML = weatherHTML;
            view.setContent(weatherHTML);
        }
    }

    async onunload() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer); // Clear the timer when unloading the plugin
        }
        await this.saveData(this.settings);
    }
}

class WeatherSettingTab extends PluginSettingTab {
    plugin: ObsidianWeatherPlugin;

    constructor(app: App, plugin: ObsidianWeatherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Temperature Unit')
            .setDesc('Toggle ON for Imperial')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.temperatureUnit === 'F');
                toggle.onChange(async (value) => {
                    this.plugin.settings.temperatureUnit = value ? 'F' : 'C';
                    await this.plugin.saveSettings();
                    this.plugin.refreshWeather();
                });
            });

        new Setting(containerEl)
            .setName('Hide Air Quality')
            .setDesc('Toggle to hide the air quality information')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.hideAirQuality)
                .onChange(async (value) => {
                    this.plugin.settings.hideAirQuality = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshWeather(); // Refresh the weather data
                })
            );


        new Setting(containerEl)
            .setName('Location')
            .setDesc('Set your location')
            .addText(text => {
                const inputEl = text
                    .setPlaceholder('Enter your location')
                    .setValue(this.plugin.settings.location)
                    .inputEl;

                // Add event listener for focus
                inputEl.addEventListener('focus', (event: FocusEvent) => {
                    (event.target as HTMLInputElement).style.borderColor = 'red';
                });

                // Add event listener for keydown
                inputEl.addEventListener('keydown', async (event: KeyboardEvent) => {
                    if (event.key === 'Enter') {
                        this.plugin.settings.location = (event.target as HTMLInputElement).value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshWeather();

                        // Reset border color after pressing 'Enter'
                        (event.target as HTMLInputElement).style.borderColor = '';

                        // Remove focus from the text field
                        inputEl.blur();
                    }
                });

                return inputEl;
            });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Set your weatherapi.com API Key')
            .addText(text => text
                .setPlaceholder('Enter your API Key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshWeather(); // Add this line
                }));

        new Setting(containerEl)
            .setName('Refresh Rate')
            .setDesc('Set the refresh rate in minutes. Enter 999 to disable the refresh.')
            .addText(text => text
                .setPlaceholder('Enter the refresh rate')
                .setValue(this.plugin.settings.refreshRate.toString())
                .onChange(async (value) => {
                    this.plugin.settings.refreshRate = Number(value);
                    await this.plugin.saveSettings();
                    this.plugin.refreshWeather(); // Add this line
                }));
    }
}