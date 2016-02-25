require 'pathname'
base = Pathname.new('src')
files = 0
File.read('README.md').scan(/```js\s+\/\/[ ]+(\S+).*\n([\s\S]*?)```/) do
  out = base + $1
  out.parent.mkpath
  if !File.exist?(out) || File.read(out) != $2
    $stderr.puts "Updating #{out}"
    files += 1
    File.write(out, $2)
  end
end
$stderr.puts "Written #{files} files."
