// Importing necessary libraries from 'obsidian'
import { App, ItemView, WorkspaceLeaf, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';

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
}

const DEFAULT_SETTINGS: WeatherPluginSettings = {
    location: '',
    apiKey: '',
    refreshRate: 30,  // default refresh rate is 30 minutes
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
    let AQI: number;

    let breakpoints: number[], AQIcalc: number;
    switch (pollutant) {
        case "co":
            breakpoints = [0, 2, 9, 15, 30, 40, 50];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "no2":
            breakpoints = [54, 101, 361, 650, 1250, 1650, 2049];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "o3":
            breakpoints = [0, 54, 71, 86, 106, 201, 605];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 500]);
            break;
        case "so2":
            breakpoints = [36, 76, 186, 305, 605, 805, 1004];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "pm2.5":
            breakpoints = [0, 12, 35.4, 55.4, 150.4, 250.4, 350.4, 500.4];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        case "pm10":
            breakpoints = [54, 155, 255, 355, 425, 505, 605];
            AQIcalc = linearInterpolate(c, breakpoints, [0, 50, 100, 150, 200, 300, 400, 500]);
            break;
        default:
            throw new Error(`Invalid pollutant "${pollutant}"`);
    }

    AQI = Math.round(AQIcalc);
    return AQI;
}



function calculateAQI(co: number, no2: number, o3: number, so2: number, pm25: number, pm10: number): number {
    // Convert pollutant values from µg/m³ to ppm
    const co_ppm = co / 1000; // Convert CO from µg/m³ to ppm
    const no2_ppm = no2 / 1889; // Convert NO2 from µg/m³ to ppm
    const o3_ppm = o3 / 2000; // Convert O3 from µg/m³ to ppm
    const so2_ppm = so2 / 2649; // Convert SO2 from µg/m³ to ppm
    const pm25_ppm = pm25; // PM2.5 is already in µg/m³, no conversion needed
    const pm10_ppm = pm10; // PM10 is already in µg/m³, no conversion needed


    // Calculate AQI for each pollutant
    const coAQI = calculatePollutantAQI(co_ppm, "co");
    const no2AQI = calculatePollutantAQI(no2_ppm, "no2");
    const o3AQI = calculatePollutantAQI(o3_ppm, "o3");
    const so2AQI = calculatePollutantAQI(so2_ppm, "so2");
    const pm25AQI = calculatePollutantAQI(pm25_ppm, "pm2.5");
    const pm10AQI = calculatePollutantAQI(pm10_ppm, "pm10");

    return Math.max(coAQI, no2AQI, o3AQI, so2AQI, pm25AQI, pm10AQI);


}


function describeAirQuality(data: AirQuality): { emoji: string, text: string, mainContributors: string } {
    const aqi = calculateAQI(data.co, data.no2, data.o3, data.so2, data.pm2_5, data.pm10);
    // console.log(aqi);
    let unsafeDescriptions = "";
    if (aqi > 50) {
        const unsafePollutants = [
            { name: 'CO', value: data.co },
            { name: 'NO2', value: data.no2 },
            { name: 'O3', value: data.o3 },
            { name: 'SO2', value: data.so2 },
            { name: 'PM2.5', value: data.pm2_5 },
            { name: 'PM10', value: data.pm10 },
        ].filter(pollutant => calculatePollutantAQI(pollutant.value, pollutant.name.toLowerCase()) >= 100);

        unsafeDescriptions = unsafePollutants.map(pollutant => `${pollutant.name}: ${pollutant.value.toFixed(3)} µg/m³`).join(', ');
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
    contentEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianWeatherPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.contentEl = this.containerEl.createDiv();


        // Refresh the weather when the view is created
        this.plugin.refreshWeather();
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

    setContent(html: string) {
        this.contentEl.innerHTML = html;

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
                const { forecastday } = data.forecast;

                // Extract forecast and rain info for each day
                const forecastDay1 = forecastday[0];
                const chance_rain_day1 = forecastDay1.day.daily_chance_of_rain;
                const icon_day1 = forecastDay1.day.condition.icon;
                const description_day1 = forecastDay1.day.condition.text;

                const forecastDay2 = forecastday[1];
                const chance_rain_day2 = forecastDay2.day.daily_chance_of_rain;
                const icon_day2 = forecastDay2.day.condition.icon;
                const description_day2 = forecastDay2.day.condition.text;

                const forecastDay3 = forecastday[2];
                const chance_rain_day3 = forecastDay3.day.daily_chance_of_rain;
                const icon_day3 = forecastDay3.day.condition.icon;
                const description_day3 = forecastDay3.day.condition.text;

                // Remaining code...

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

        // Schedule a new timer
        this.refreshTimer = setTimeout(() => this.refreshWeather(), this.settings.refreshRate * 60 * 1000);
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


        const aqi = calculateAQI(
            air_quality.co,
            air_quality.no2,
            air_quality.o3,
            air_quality.so2,
            air_quality.pm2_5,
            air_quality.pm10
        );

        const { emoji: airQualityEmoji, text: airQualityText, mainContributors: unsafeContributors } = describeAirQuality(air_quality);

        // const airQualityDescription = `${airQualityEmoji} ${airQualityText}`;
        const airQualityDescription = `${airQualityEmoji} ${airQualityText} (AQI: ${aqi})`;


        const airQualityContributors = `${unsafeContributors}`;

        const uvIndexDescription = getUVIndexDescription(uv);
        const uvIndexText = `UV: ${uv} - ${uvIndexDescription}`;


        return `
        <div style="text-align: center;">
            <div style="font-size: 1.2em; margin-bottom: -20px;">${location.name}</div>
            <div style="display: flex; align-items: center; justify-content: center;">
                <div style="margin-right: 5px;">
                    <img src="http:${condition.icon}" alt="${condition.text}" style="width: 128px; height: 128px;" />
                </div>
                <div style="margin-left: 5px; text-align: center; display: flex; flex-direction: column;">
                    <div>${current.temp_c}°C <span style="font-size: 1.1em; font-weight: bold; color: var(--color-accent);">${current.feelslike_c}°C</span></div>
                    <div>Humidity: ${current.humidity}%</div>
                    <div>${uvIndexText}</div>
                </div>
            </div>
            <div style="color: var(--color-accent); font-size: 1.2em; margin-top: -20px; text-align: center;">${condition.text}</div>
            <div style="text-align: center;">${airQualityDescription}</div>
            <div style="color: var(--color-accent); margin-bottom: 10px; text-align: center;">${airQualityContributors}</div>
            <div style="display: flex; justify-content: center;">
                <div style="display: flex; flex-direction: column; align-items: center; margin-right: 10px;">
                    <div style="font-size: 0.8em; margin-bottom: 5px;">${date_day1 === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ? 'TODAY' : date_day1}</div>
                    <img src="http:${icon_day1}" alt="Day 1" style="width: 48px; height: 48px;" />
                    <div>${chance_rain_day1}%</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; margin-right: 10px;">
                    <div style="font-size: 0.8em; margin-bottom: 5px;">${date_day2}</div>
                    <img src="http:${icon_day2}" alt="Day 2" style="width: 48px; height: 48px;" />
                    <div>${chance_rain_day2}%</div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: center;">
                    <div style="font-size: 0.8em; margin-bottom: 5px;">${date_day3}</div>
                    <img src="http:${icon_day3}" alt="Day 3" style="width: 48px; height: 48px;" />
                    <div>${chance_rain_day3}%</div>
                </div>
            </div>
            <div style="color: gray; margin-right: 5px; margin-bottom: 30px; font-size: 0.7em; text-align: right;">${location.localtime}</div>
        </div>
      
      `;
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
                    }
                });

                return inputEl;
            });

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Set your OpenWeatherMap API Key')
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
            .setDesc('Set the refresh rate in minutes')
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