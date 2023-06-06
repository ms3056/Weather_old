// Importing necessary libraries from 'obsidian'
import { App, ItemView, WorkspaceLeaf, Plugin, PluginSettingTab, Setting, MarkdownView } from 'obsidian';
import { h, Fragment, render } from 'preact';

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

		const aqi = calculateAQI(
			air_quality.co,
			air_quality.no2,
			air_quality.o3,
			air_quality.so2,
			air_quality.pm2_5,
			air_quality.pm10
		);

		const containerEl = document.createElement('div');
		containerEl.style.textAlign = 'center';

		const Icon = () => <div class="weather__icon">
			<img src={`http:${condition.icon}`} alt={condition.text} style="width: 100px; height: 100px;" /> {/* icon */}
		</div>

		const Temperature = () => <div class="weather__temperature">
			<div>
				{current.temp_c}°C
			</div>
			<div style="color: var(--color-accent); font-weight: bold;">
				{current.feelslike_c}°C
			</div>
		</div>
		const Humidity = () => <div>
			<div>Humidity: </div>
			<div>{current.humidity}</div>
		</div>
		const Uv = () => {
			const uvIndexDescription = getUVIndexDescription(uv);
			const uvIndexText = `${uv} - ${uvIndexDescription}`;

			return (
				<div>
					<div>UV:</div>
					<div>{uvIndexText}</div>
				</div>
			)
		}

		const AirQualityCircle = ({ aqi }: { aqi: number }) => <div class={"weather__aqi-circle weather__aqi-circle--" + aqi} />
		const AirQuality = () => {
			const { emoji: airQualityEmoji, text: airQualityText, mainContributors: unsafeContributors } = describeAirQuality(air_quality);
			const airQualityIndex = air_quality["us-epa-index"];
			const airQualityContributors = `${unsafeContributors}`;

			return <div class="weather__aqi">
				{airQualityEmoji} {airQualityText} (AQI: {aqi} - <AirQualityCircle aqi={airQualityIndex} />)
				<div class="weather__aq-contributors">
					{airQualityContributors}
				</div>
			</div>
		}

		const WeatherForecastDay = ({ icon, date, rainChance }: { icon: string, date: string, rainChance: number }) => <div>
			<div class=".weather__forecast-date">{
				date === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ? 'TODAY' : date
			}</div>
			<div class="weather__icon weather__icon-secondary">
				<img src={"http:" + icon} alt="Day 2" />
			</div>
			<div class="weather__forecast-rain-chance">
				{rainChance == 0 ? '-' : rainChance + "%"}
			</div>
		</div>

		const MAX_FORECAST = 3
		const forecastDays: h.JSX.Element[] = []

		for (let forecastDay of forecast?.forecastday.slice(0, MAX_FORECAST) || []) {
			const date = new Date(forecastDay.date_epoch * 1000)
				.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			forecastDays.push(
				<WeatherForecastDay
					icon={forecastDay.day.condition.icon}
					date={date}
					rainChance={forecastDay.day.daily_chance_of_rain}
				/>
			)
		}

		render((
			<div class="weather__base">
				<div class="weather__location">
					{location.name}
				</div>
				<div style="display: flex; align-items: center; justify-content: center;">
					<Icon />
					<div
						class="weather__info"
					>
						<Temperature />
						<Humidity />
						<Uv />
					</div>
				</div>
				<div class="weather__condition">
					{condition.text}
				</div>
				<AirQuality />
				<div class="weather__forecast">
					{forecastDays}
				</div>

				<div class="weather__localtime">{location.localtime}</div>
			</div>
		), containerEl)

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
