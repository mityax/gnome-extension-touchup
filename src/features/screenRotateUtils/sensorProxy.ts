import Gio from "gi://Gio";


/**
 * This is the original interface xml (and stripped down to what we need to work with the accelerometer),
 * taken directly from:
 * https://gitlab.freedesktop.org/hadess/iio-sensor-proxy/-/blob/master/src/net.hadess.SensorProxy.xml
 * */
const interfaceXml = `
<node>
  <!--
      net.hadess.SensorProxy:
      @short_description: D-Bus proxy to access hardware sensors

      After checking the availability of the sensor type you want to monitor,
      call the net.hadess.SensorProxy.ClaimAccelerometer() or the
      net.hadess.SensorProxy.ClaimLight() method to start updating the properties
      from the hardware readings.

      The object path will be "/net/hadess/SensorProxy".
  -->
  <interface name="net.hadess.SensorProxy">
    <property name="HasAccelerometer" type="b" access="read"/>
    <property name="AccelerometerOrientation" type="s" access="read"/>
    <property name='AccelerometerTilt' type='s' access='read'/>

    <!--
       ClaimAccelerometer:

       To start receiving accelerometer reading updates from the proxy, the application
       must call the net.hadess.SensorProxy.ClaimAccelerometer() method. It can do so
       whether an accelerometer is available or not, updates would then be sent when an
       accelerometer appears.

       Applications should call net.hadess.SensorProxy.ReleaseAccelerometer() when
       readings are not required anymore. For example, an application that monitors
       the orientation of the main screen should stop monitoring for updates when that
       screen has been turned off.

       This prevents the sensor proxy from polling the device, thus increasing wake-ups
       and reducing battery life.
    -->
    <method name="ClaimAccelerometer"/>

    <!--
        ReleaseAccelerometer:

        This should be called as soon as readings are not required anymore. Note
        that resources are freed up if a monitoring application exits without
        calling net.hadess.SensorProxy.ReleaseAccelerometer(), crashes or the sensor disappears.
    -->
    <method name="ReleaseAccelerometer"/>
  </interface>
</node>
`

export class SensorProxy extends (
    Gio.DBusProxy.makeProxyWrapper(interfaceXml) as any as (Gio.DBusProxy & SensorProxyInterface)
) {}


interface SensorProxyInterface {
    new(
        bus: Gio.DBusConnection,
        name: string,
        objectPath: string,
    ): Gio.DBusProxy & SensorProxyInterface;
    new(
        bus: Gio.DBusConnection,
        name: string,
        objectPath: string,
        readyCallback: (proxy: Gio.DBusProxy & SensorProxyInterface, error: any) => void,
        cancellable: boolean | null,
        flags: Gio.DBusProxyFlags,
    ): Gio.DBusProxy & SensorProxyInterface;

    /** Whether the device has an accelerometer. */
    HasAccelerometer: boolean;

    /** The current accelerometer orientation (e.g., "normal", "bottom-up", "left-up", "right-up"). */
    AccelerometerOrientation: AccelerometerOrientation;

    /** The current accelerometer tilt (e.g., "face-up", "face-down"). */
    AccelerometerTilt: string;

    /**
     * Start receiving accelerometer updates.
     * Equivalent to `net.hadess.SensorProxy.ClaimAccelerometer()`.
     */
    ClaimAccelerometerAsync(): Promise<void>;

    /**
     * Stop receiving accelerometer updates.
     * Equivalent to `net.hadess.SensorProxy.ReleaseAccelerometer()`.
     */
    ReleaseAccelerometerAsync(): Promise<void>;
}

export type AccelerometerOrientation = 'normal' | 'right-up' | 'bottom-up' | 'left-up';
