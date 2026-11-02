require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

# CocoaPods variant of Package.swift, for apps that still use CocoaPods.
Pod::Spec.new do |s|
  s.name = 'BlacklightMobile'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/beedywool/blacklight-engine'
  s.author = 'Blacklight Engine contributors'
  s.source = { :git => 'https://github.com/beedywool/blacklight-engine.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.frameworks = 'GameKit'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
